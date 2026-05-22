// apps/api/src/auth/interfaces/auth.interfaces.ts
import { UserRole } from '@prisma/client';

export interface TokenPayload {
  sub: string;    // user ID
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    username: string;
    displayName: string | null;
    role: UserRole;
    emailVerified: boolean;
    avatarUrl: string | null;
  };
}

export interface RegisterDto {
  email: string;
  username: string;
  password: string;
  displayName?: string;
}