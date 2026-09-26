import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AuthService } from '../auth.service';
import { TokenPayload } from '../interfaces/auth.interfaces';

/** Set on the request for authenticated calls: the session the access token belongs to. */
export const AUTH_SESSION_ID = 'authSessionId';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
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
