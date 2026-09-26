// apps/api/src/auth/auth.controller.ts
import {
  Controller,
  Post,
  Body,
  Get,
  HttpCode,
  HttpStatus,
  Request,
  Delete,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, RefreshDto } from './dto/auth.dto';
import { CurrentUser } from '../common/decorators/index';
import { Public } from '../common/decorators/index';
import { User } from '@prisma/client';
import { PublicUser, toPublicUser } from './interfaces/auth.interfaces';
import { AUTH_SESSION_ID } from './strategies/jwt.strategy';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 registrations per minute per IP
  @ApiOperation({ summary: 'Register a new account' })
  async register(@Body() dto: RegisterDto, @Request() req: any) {
    return this.authService.register(
      dto,
      req.ip as string,
      req.headers['user-agent'] as string,
    );
  }

  /**
   * The body is validated like every other one (LoginDto) and checked here.
   * It used to go through passport-local, whose guard runs before pipes, so
   * the body was never validated and unknown fields were accepted (B-04).
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Login with email and password' })
  async login(@Body() dto: LoginDto, @Request() req: any) {
    const user = await this.authService.validateLocalUser(dto.email, dto.password);
    return this.authService.login(user, req.ip, req.headers['user-agent']);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  // Tighter than the global 100/min: each call does a token verify and a rotation (S-20).
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Refresh access token using a refresh token' })
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Revoke current session' })
  async logout(@CurrentUser() user: User, @Body() dto: RefreshDto, @Request() req: any) {
    await this.authService.logout(user.id, dto.refreshToken, req[AUTH_SESSION_ID]);
  }

  @Delete('sessions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Revoke all sessions (logout everywhere)' })
  async logoutAll(@CurrentUser() user: User) {
    await this.authService.logoutAll(user.id);
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get current user profile' })
  me(@CurrentUser() user: User): PublicUser {
    return toPublicUser(user);
  }
}
