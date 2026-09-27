'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from '@/types/auth.types';
import { hasSessionCookie, moveLegacySession } from '@/lib/api/client';

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  hasHydrated: boolean;
  setAuth: (user: AuthUser) => void;
  clearAuth: () => void;
}

/**
 * Who is signed in, for the UI. The session itself is in httpOnly cookies the
 * API manages (D-17, lib/api/client.ts); this store keeps only the public user
 * profile, and a stored profile counts only while the session cookie exists.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set): AuthState => ({
      user: null,
      isAuthenticated: false,
      hasHydrated: false,

      setAuth: (user) => set({ user, isAuthenticated: true }),

      clearAuth: () => set({ user: null, isAuthenticated: false }),
    }),
    {
      name: 'pl-auth',
      // Rehydrated by <Providers> after mount, not at module load. Reading
      // storage during the first client render made signed-in pages differ
      // from the (always signed-out) server HTML: a hydration error on every
      // page view (audit 05, FE-02). Auth-dependent UI waits for hasHydrated.
      skipHydration: true,
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
      onRehydrateStorage: () => (state) => {
        const user = state?.user ?? null;
        const finish = (signedIn: boolean) =>
          // setState, not mutation: rehydration runs after the first render,
          // so subscribers must be notified.
          useAuthStore.setState({ user: signedIn ? user : null, isAuthenticated: signedIn, hasHydrated: true });
        if (!user) return finish(false);
        if (hasSessionCookie()) return finish(true);
        // A session from before the cookies may still be in localStorage.
        void moveLegacySession().then(finish);
      },
    },
  ),
);
