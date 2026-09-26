// apps/api/src/auth/interfaces/auth.interfaces.ts
import { User, UserRole } from '@prisma/client';

export interface TokenPayload {
  sub: string;    // user ID
  email: string;
  role: UserRole;
  jti?: string;
  iat?: number;
  exp?: number;
}

/** The only user fields the API ever returns about the signed-in user. */
export interface PublicUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  role: UserRole;
  emailVerified: boolean;
  avatarUrl: string | null;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    emailVerified: user.emailVerified,
    avatarUrl: user.avatarUrl,
  };
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

export interface RegisterDto {
  email: string;
  username: string;
  password: string;
  displayName?: string;
}
