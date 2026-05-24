export type UserRole = 'USER' | 'MODERATOR' | 'ADMIN';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  role: UserRole;
  emailVerified: boolean;
  avatarUrl: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  email: string;
  username: string;
  password: string;
  displayName?: string;
}