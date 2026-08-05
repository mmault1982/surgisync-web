import { createContext, use, useCallback, useEffect, useSyncExternalStore } from 'react';

import type { WebUser } from '@/api/generated/model';

import {
  ensureRestored,
  getAccessToken,
  getCurrentUser,
  getRestoreSettled,
  login as storeLogin,
  logout as storeLogout,
  subscribe,
} from './auth-store';

export type AuthStatus = 'restoring' | 'authenticated' | 'anonymous';

export interface AuthApi {
  status: AuthStatus;
  user: WebUser | null;
  login: (email: string, password: string) => Promise<WebUser>;
  logout: () => Promise<void>;
  /**
   * Resolve whether a session exists. Exposed so the router's `beforeLoad` —
   * which runs outside React and has no context — can await the same memoised
   * promise the provider does, rather than starting a second refresh.
   */
  ensureRestored: () => Promise<WebUser | null>;
}

const AuthContext = createContext<AuthApi | null>(null);

/**
 * A thin subscriber over the module-scope store in auth-store.ts.
 *
 * The store owns the state because the axios interceptor must read the token
 * without a hook, and because single-flight refresh has to be a module
 * singleton. This component exists only to re-render when it changes.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const token = useSyncExternalStore(subscribe, getAccessToken);
  const user = useSyncExternalStore(subscribe, getCurrentUser);
  const settled = useSyncExternalStore(subscribe, getRestoreSettled);

  useEffect(() => {
    // Safe under StrictMode: ensureRestored is memoised, so the double-invoked
    // effect awaits one promise rather than firing two refreshes — which would
    // rotate the cookie twice and kill the session.
    void ensureRestored();
  }, []);

  const status: AuthStatus = !settled ? 'restoring' : token ? 'authenticated' : 'anonymous';

  const login = useCallback((email: string, password: string) => storeLogin(email, password), []);
  const logout = useCallback(() => storeLogout(), []);

  const value: AuthApi = { status, user, login, logout, ensureRestored };

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthApi {
  const context = use(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
