// apps/api/src/auth/auth.service.ts
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { RegisterDto } from './dto/auth.dto';
import { TokenPayload, AuthTokens, toPublicUser } from './interfaces/auth.interfaces';
import { NotificationChannelsService } from '../notifications/notification-channels.service';

/**
 * Two tabs sharing one stored refresh token can both refresh at once; the
 * slower one presents a token the faster one just rotated. Inside this window
 * that is treated as a race, not as theft (S-05).
 */
export const REFRESH_REUSE_GRACE_MS = 60_000;

/** Sessions are looked up by this, so the database never holds a usable token (S-06). */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly notificationChannels: NotificationChannelsService,
  ) {}

  async register(dto: RegisterDto, ip?: string, userAgent?: string): Promise<AuthTokens> {
    // Both are stored lowercased, so compare lowercased: "User@X.com" used to
    // miss "user@x.com" here and fail later on the unique index instead.
    const email = dto.email.toLowerCase();
    const username = dto.username.toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
      select: { email: true, username: true },
    });

    if (existing) {
      if (existing.email === email) {
        throw new ConflictException('Email already registered');
      }
      throw new ConflictException('Username already taken');
    }

    const rounds = this.config.get<number>('auth.bcryptRounds', 12);
    const passwordHash = await bcrypt.hash(dto.password, rounds);

    const user = await this.prisma.user.create({
      data: {
        email,
        username,
        displayName: dto.displayName ?? dto.username,
        passwordHash,
        role: UserRole.USER,
      },
    });

    // Give every account a working alert destination immediately. The address
    // is pre-verified because registration already proved control of it, and
    // without this a new user would set an alert and never hear anything.
    await this.notificationChannels.ensureDefaultChannels(user.id, user.email);

    // The id, not the e-mail: logs are not a place for personal data (S-12).
    this.logger.log(`New user registered: ${user.id}`);
    return this.createSessionAndTokens(user, ip, userAgent);
  }

  async validateLocalUser(email: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user || user.deletedAt) {
      // Same bcrypt work as a real check, so response time does not reveal
      // which e-mails have accounts. The hash must be well-formed: bcrypt
      // returns immediately for a malformed one (S-10).
      await bcrypt.compare(password, await this.timingDummyHash());
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) throw new UnauthorizedException('Invalid credentials');

    return user;
  }

  /** A valid hash at the same cost as real ones, made once per process. */
  timingDummyHash(): Promise<string> {
    this.dummyHash ??= bcrypt.hash(uuidv4(), this.config.get<number>('auth.bcryptRounds', 12));
    return this.dummyHash;
  }

  async login(user: User, ip?: string, userAgent?: string): Promise<AuthTokens> {
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return this.createSessionAndTokens(user, ip, userAgent);
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    let payload: TokenPayload;
    try {
      payload = this.jwtService.verify<TokenPayload>(refreshToken, {
        secret: this.config.get<string>('auth.jwtRefreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.findSessionByRefreshToken(refreshToken);
    if (!session || session.userId !== payload.sub) {
      throw new UnauthorizedException('Session expired or revoked');
    }

    if (session.revokedAt) {
      // A rotated token coming back after the grace window means two parties
      // hold it -- the user and whoever copied it. Ending every session is
      // the only way to cut the copy off (OAuth 2.0 security BCP, 4.14).
      if (session.rotatedAt && Date.now() - session.rotatedAt.getTime() > REFRESH_REUSE_GRACE_MS) {
        this.logger.warn(`Refresh token reuse for user ${session.userId}; revoking all sessions`);
        await this.logoutAll(session.userId);
      }
      throw new UnauthorizedException('Session expired or revoked');
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired or revoked');
    }

    // Rotate. The revoke is conditional so two concurrent refreshes cannot
    // both succeed and fork the session (S-05).
    const now = new Date();
    const { count } = await this.prisma.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: now, rotatedAt: now },
    });
    if (count !== 1) throw new UnauthorizedException('Session expired or revoked');

    return this.createSessionAndTokens(session.user, session.ipAddress ?? undefined, session.userAgent ?? undefined);
  }

  /**
   * Ends the caller's current session (so its access token stops working at
   * once) and the session of the refresh token they hand back, if it is theirs.
   */
  async logout(userId: string, refreshToken: string, currentSessionId?: string): Promise<void> {
    const byToken = await this.findSessionByRefreshToken(refreshToken);
    const ids = [currentSessionId, byToken?.userId === userId ? byToken.id : undefined].filter(
      (id): id is string => !!id,
    );
    if (ids.length === 0) return;
    await this.prisma.session.updateMany({
      where: { id: { in: ids }, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Access tokens carry their session id as `jti`, so revoking the session --
   * logout, logout everywhere, reuse detection -- ends the access token too,
   * instead of leaving it valid until it expires (S-04).
   */
  async validateJwtUser(payload: TokenPayload): Promise<User> {
    const session = payload.jti
      ? await this.prisma.session.findUnique({ where: { id: payload.jti }, include: { user: true } })
      : null;
    if (!session || session.revokedAt || session.expiresAt < new Date() || session.userId !== payload.sub) {
      throw new UnauthorizedException('Session expired or revoked');
    }
    if (session.user.deletedAt) throw new UnauthorizedException('User not found');
    return session.user;
  }

  /**
   * Sessions store a hash of the refresh token. Rows created before hashing
   * (phase 04) still hold the raw token; they are found by it until they
   * expire. Remove the fallback after 2026-10-26 (the 30-day refresh TTL).
   */
  private async findSessionByRefreshToken(refreshToken: string) {
    return (
      (await this.prisma.session.findUnique({
        where: { refreshToken: hashRefreshToken(refreshToken) },
        include: { user: true },
      })) ??
      (await this.prisma.session.findUnique({ where: { refreshToken }, include: { user: true } }))
    );
  }

  private async createSessionAndTokens(
    user: User,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthTokens> {
    const sessionId = uuidv4();
    const payload: TokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      jti: sessionId,
    };

    const accessToken = this.jwtService.sign(payload);

    const refreshTtl = this.config.get<string>('auth.jwtRefreshTtl', '7d');
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.get<string>('auth.jwtRefreshSecret'),
      expiresIn: refreshTtl,
    });

    // The session lives exactly as long as its refresh token (S-16); it used
    // to be a fixed 7 days while production issues 30-day tokens.
    const { exp } = this.jwtService.decode(refreshToken) as { exp: number };

    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshToken: hashRefreshToken(refreshToken),
        ipAddress: ip,
        userAgent,
        expiresAt: new Date(exp * 1000),
      },
    });

    // Clean up old sessions (keep last 5)
    const sessions = await this.prisma.session.findMany({
      where: { userId: user.id, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (sessions.length > 5) {
      const toRevoke = sessions.slice(5).map((s) => s.id);
      await this.prisma.session.updateMany({
        where: { id: { in: toRevoke } },
        data: { revokedAt: new Date() },
      });
    }

    return {
      accessToken,
      refreshToken,
      user: toPublicUser(user),
    };
  }
}
