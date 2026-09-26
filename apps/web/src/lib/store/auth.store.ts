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
      // Rehydrated by <Providers> after mount, not at module load. Reading
      // localStorage during the first client render made signed-in pages
      // differ from the (always signed-out) server HTML: a hydration error on
      // every page view (audit 05, FE-02). Auth-dependent UI waits for
      // hasHydrated instead.
      skipHydration: true,
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        // Tokens live in localStorage (they are deliberately not persisted by
        // this store), so re-attach them after rehydration. Without this the
        // store reports isAuthenticated with null tokens, and logout posts an
        // empty refreshToken — leaving the session live on the server.
        // setState, not mutation: rehydration now runs after the first render,
        // so subscribers must be notified.
        const { access, refresh } = getStoredTokens();
        // Tokens are the source of truth: if they are gone, so is the session.
        const signedIn = Boolean(state?.user && access && refresh);
        useAuthStore.setState({
          accessToken: access,
          refreshToken: refresh,
          user: signedIn ? state!.user : null,
          isAuthenticated: signedIn,
          hasHydrated: true,
        });
      },
    },
  ),
);
