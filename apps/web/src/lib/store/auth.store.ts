'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from '@/types/auth.types';
import { setStoredTokens, clearStoredTokens, getStoredTokens } from '@/lib/api/client';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  hasHydrated: boolean;
  setAuth: (user: AuthUser, accessToken: string, refreshToken: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      hasHydrated: false,

      setAuth: (user, accessToken, refreshToken) => {
        setStoredTokens(accessToken, refreshToken);
        set({ user, accessToken, refreshToken, isAuthenticated: true });
      },

      clearAuth: () => {
        clearStoredTokens();
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
      },
    }),
    {
      name: 'pl-auth',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Tokens live in localStorage (they are deliberately not persisted by
        // this store), so re-attach them after rehydration. Without this the
        // store reports isAuthenticated with null tokens, and logout posts an
        // empty refreshToken — leaving the session live on the server.
        const { access, refresh } = getStoredTokens();
        state.accessToken = access;
        state.refreshToken = refresh;
        // Tokens are the source of truth: if they are gone, so is the session.
        if (!access || !refresh) {
          state.user = null;
          state.isAuthenticated = false;
        }
        state.hasHydrated = true;
      },
    },
  ),
);
