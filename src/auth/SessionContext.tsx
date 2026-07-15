import { createContext, useContext, useState, type ReactNode } from "react";
import { ApiClient } from "../api/client";
import { currentEnv } from "../config/env";
import { localStorageTokens } from "./tokens";

/**
 * App-wide auth state — a port of the iOS spike's `Session`. The root
 * component switches between login and content on `state`.
 */

type AuthState = "loggedIn" | "loggedOut";

interface SessionValue {
  state: AuthState;
  api: ApiClient;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [api] = useState(() => new ApiClient(currentEnv.baseUrl, localStorageTokens));
  // Optimistic: a stored refresh token counts as logged in; the first API
  // call refreshes or bounces to login via onAuthFailure.
  const [state, setState] = useState<AuthState>(() =>
    localStorageTokens.refreshToken() !== null ? "loggedIn" : "loggedOut",
  );

  const expire = () => {
    localStorageTokens.clear();
    setState("loggedOut");
  };
  api.onAuthFailure = expire;

  const value: SessionValue = {
    state,
    api,
    async login(email, password) {
      await api.login(email, password);
      setState("loggedIn");
    },
    // Best-effort server-side logout, then always clear local state.
    async logout() {
      await api.logout();
      expire();
    },
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used within SessionProvider");
  return value;
}
