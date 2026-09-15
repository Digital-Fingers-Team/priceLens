import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!isPublic) {
      return (await super.canActivate(context)) as boolean;
    }

    // A @Public route still runs the strategy when a token is present, so
    // `request.user` is populated for callers who *are* signed in.
    //
    // Without this, a public-but-personalised route (price history, which is
    // clamped to the caller's plan window) sees no user at all and silently
    // serves a paying subscriber the free-tier response. Failure is swallowed
    // in every case: a public route must never 401, whatever the token says.
    const request = context.switchToHttp().getRequest();
    const authorization: string | undefined = request.headers?.authorization;
    if (!authorization?.startsWith('Bearer ')) return true;

    try {
      await super.canActivate(context);
    } catch {
      // Expired, malformed or revoked — the route is public, so carry on
      // anonymously rather than rejecting.
    }
    return true;
  }

  /**
   * Passport calls this with the strategy's outcome. On a public route an
   * error must not throw, or the swallow above would never be reached for
   * some failure modes.
   */
  handleRequest<TUser = unknown>(err: unknown, user: TUser, info: unknown, context: ExecutionContext): TUser {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return (user ?? undefined) as TUser;

    return super.handleRequest(err, user, info, context) as TUser;
  }
}
