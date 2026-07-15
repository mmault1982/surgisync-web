import type { TokenPair } from "../api/types";

/** localStorage-backed token store — the browser analog of the iOS keychain wrapper. */

const ACCESS_KEY = "surgisync.access_token";
const REFRESH_KEY = "surgisync.refresh_token";

export interface TokenStore {
  accessToken(): string | null;
  refreshToken(): string | null;
  store(pair: TokenPair): void;
  clear(): void;
}

export const localStorageTokens: TokenStore = {
  accessToken: () => localStorage.getItem(ACCESS_KEY),
  refreshToken: () => localStorage.getItem(REFRESH_KEY),
  store(pair) {
    localStorage.setItem(ACCESS_KEY, pair.access_token);
    localStorage.setItem(REFRESH_KEY, pair.refresh_token);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};
