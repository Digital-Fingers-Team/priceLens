// apps/api/src/auth/auth.controller.ts
import {
  Controller,
  Post,
  Body,
  Get,
  HttpCode,
  HttpStatus,
  Request,
  Res,
  Delete,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, RefreshDto } from './dto/auth.dto';
import { CurrentUser } from '../common/decorators/index';
import { Public } from '../common/decorators/index';
import { User } from '@prisma/client';
import { PublicUser, toPublicUser } from './interfaces/auth.interfaces';
import { AUTH_SESSION_ID } from './strategies/jwt.strategy';
import { AuthTokens } from './interfaces/auth.interfaces';
import { REFRESH_COOKIE, clearAuthCookies, requestCookies, setAuthCookies, wantsCookieMode } from './auth-cookies';
import { SkipCsrf } from '../common/guards/csrf.guard';

/**
 * Cookie mode (the website, D-17): the tokens go into httpOnly cookies and the
 * body carries only the user. Otherwise the tokens are in the body as before.
 */
function respond(req: any, res: Response, tokens: AuthTokens): AuthTokens | Pick<AuthTokens, 'user'> {
  if (!wantsCookieMode(req)) return tokens;
  setAuthCookies(res, tokens);
  return { user: tokens.user };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @SkipCsrf()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 registrations per minute per IP
  @ApiOperation({ summary: 'Register a new account' })
  async register(@Body() dto: RegisterDto, @Request() req: any, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.register(dto, req.ip as string, req.headers['user-agent'] as string);
    return respond(req, res, tokens);
  }

  /**
   * The body is validated like every other one (LoginDto) and checked here.
   * It used to go through passport-local, whose guard runs before pipes, so
   * the body was never validated and unknown fields were accepted (B-04).
   */
  @Public()
  @SkipCsrf()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Login with email and password' })
  async login(@Body() dto: LoginDto, @Request() req: any, @Res({ passthrough: true }) res: Response) {
    const user = await this.authService.validateLocalUser(dto.email, dto.password);
    return respond(req, res, await this.authService.login(user, req.ip, req.headers['user-agent']));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  // Tighter than the global 100/min: each call does a token verify and a rotation (S-20).
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Refresh access token using a refresh token' })
  async refresh(@Body() dto: RefreshDto, @Request() req: any, @Res({ passthrough: true }) res: Response) {
    // The body token (bearer clients, and the one-time move of a website
    // session out of localStorage) or the httpOnly cookie.
    const refreshToken = dto.refreshToken ?? requestCookies(req)[REFRESH_COOKIE];
    if (!refreshToken) throw new UnauthorizedException('No refresh token');
    return respond(req, res, await this.authService.refreshTokens(refreshToken));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Revoke current session' })
  async logout(
    @CurrentUser() user: User,
    @Body() dto: RefreshDto,
    @Request() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = dto.refreshToken ?? requestCookies(req)[REFRESH_COOKIE] ?? '';
    await this.authService.logout(user.id, refreshToken, req[AUTH_SESSION_ID]);
    clearAuthCookies(res);
  }

  @Delete('sessions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Revoke all sessions (logout everywhere)' })
  async logoutAll(@CurrentUser() user: User, @Res({ passthrough: true }) res: Response) {
    await this.authService.logoutAll(user.id);
    clearAuthCookies(res);
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get current user profile' })
  me(@CurrentUser() user: User): PublicUser {
    return toPublicUser(user);
  }
}
