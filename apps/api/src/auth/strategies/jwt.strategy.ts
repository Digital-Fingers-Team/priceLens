import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AuthService } from '../auth.service';
import { TokenPayload } from '../interfaces/auth.interfaces';
import { ACCESS_COOKIE, requestCookies } from '../auth-cookies';

/** Set on the request for authenticated calls: the session the access token belongs to. */
export const AUTH_SESSION_ID = 'authSessionId';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      // A bearer header (partner API, scripts) wins; the website sends the
      // httpOnly session cookie instead (D-17).
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request) => requestCookies(req)[ACCESS_COOKIE] ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('auth.jwtAccessSecret'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: TokenPayload) {
    const user = await this.authService.validateJwtUser(payload);
    (req as Request & { [AUTH_SESSION_ID]?: string })[AUTH_SESSION_ID] = payload.jti;
    return user;
  }
}
