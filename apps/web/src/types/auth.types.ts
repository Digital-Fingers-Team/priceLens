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

/** What login, register and refresh return to the website: the tokens are httpOnly cookies (D-17). */
export interface AuthSession {
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