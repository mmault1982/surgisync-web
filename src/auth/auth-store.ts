/**
 * Session state, outside React.
 *
 * The axios interceptor is not a component and cannot read a hook, so a token
 * held in React state would be a stale closure by the time a 401 arrives. Just
 * as importantly, the single-flight guard below must be a genuine module
 * singleton — one per provider instance would not prevent the concurrent
 * refresh it exists to prevent.
 *
 * The access token lives in memory only: never localStorage, never a cookie we
 * can read. The refresh token is not readable here at all — it is an httpOnly
 * cookie the browser attaches to /api/v1/web/ and nothing else.
 */
import axios from 'axios';

import type { WebLoginResponse, WebRefreshResponse, WebUser } from '@/api/generated/model';

/**
 * Requests under this prefix carry the refresh cookie and must never enter the
 * 401-refresh path. See the interceptor in src/api/axios-instance.ts.
 */
export const WEB_AUTH_PREFIX = '/api/v1/web/';

/**
 * Refresh this many seconds before the access token expires.
 *
 * The backend returns `expires_in` explicitly so the client can be proactive. A
 * purely reactive interceptor produces a burst of 401s on wake, against an
 * IP-keyed bucket shared by everyone behind the same NAT.
 */
const REFRESH_LEAD_SECONDS = 60;

/** Floor on the refresh timer, so a pathological `expires_in` cannot spin. */
const MIN_REFRESH_DELAY_SECONDS = 5;

const USER_CACHE_KEY = 'surgisync.user.v1';

let accessToken: string | null = null;
let currentUser: WebUser | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let inFlightRefresh: Promise<string> | null = null;
let bootRestore: Promise<WebUser | null> | null = null;

/**
 * Whether the one boot restore has finished.
 *
 * This is what separates "not signed in" from "we do not know yet". Without it
 * the app flashes a login form at someone who is already signed in, every time
 * they hard-load a page.
 */
let restoreSettled = false;

const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) listener();
};

export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getAccessToken = () => accessToken;
export const getCurrentUser = () => currentUser;
export const getRestoreSettled = () => restoreSettled;

/**
 * A client with NO interceptors.
 *
 * Using the shared instance here would make a refresh capable of triggering a
 * refresh. Keeping it structurally separate means that invariant cannot be
 * broken later by editing an interceptor.
 */
const authClient = axios.create({ baseURL: '/', withCredentials: true });

/**
 * Refresh the access token, collapsing concurrent callers into one request.
 *
 * Single-flight is mandatory, not an optimisation. POST /api/v1/web/refresh/
 * ROTATES the cookie: it blacklists the token it was given and sets the
 * successor. Two concurrent refreshes therefore both present the same cookie —
 * the second presents one the first already blacklisted, gets a 401, and the
 * backend CLEARS THE COOKIE, ending a session that was perfectly healthy.
 *
 * Every caller shares this promise: the 401 interceptor (N concurrent
 * requests), the proactive timer, and boot restore. It is also why <StrictMode>
 * is safe again — its double-invoked effects now collapse into one request.
 */
export function refreshAccessToken(): Promise<string> {
  inFlightRefresh ??= performRefresh().finally(() => {
    inFlightRefresh = null;
  });
  return inFlightRefresh;
}

async function performRefresh(): Promise<string> {
  // No body and no params: the backend reads the cookie off the request.
  const { data } = await authClient.post<WebRefreshResponse>(`${WEB_AUTH_PREFIX}refresh/`);
  applySession(data.access_token, data.expires_in);
  return data.access_token;
}

function applySession(token: string, expiresIn: number) {
  accessToken = token;
  scheduleProactiveRefresh(expiresIn);
  emit();
}

function scheduleProactiveRefresh(expiresIn: number) {
  clearTimeout(refreshTimer);
  const delaySeconds = Math.max(expiresIn - REFRESH_LEAD_SECONDS, MIN_REFRESH_DELAY_SECONDS);
  refreshTimer = setTimeout(() => {
    void refreshAccessToken().catch(() => endSession());
  }, delaySeconds * 1000);
}

/**
 * Determine whether a session exists, once per page load.
 *
 * There is nothing readable to guess from — the refresh cookie is httpOnly — so
 * the only way to find out is to spend a real refresh call. Memoised so the
 * provider effect and every route guard await the same promise rather than
 * racing each other into the rotation problem described above.
 */
export function ensureRestored(): Promise<WebUser | null> {
  bootRestore ??= (async () => {
    try {
      await refreshAccessToken();
    } catch {
      // 401 refresh_token_missing / refresh_token_invalid: no session. The
      // backend has already cleared the cookie, so this will not retry forever.
      clearLocalState();
      return null;
    }
    // /refresh/ returns no user — WebRefreshResponse is tokens only — so the
    // profile comes from a cache written at login. It is display data
    // (id, email, name, role, organization) and holds no credential.
    currentUser = readCachedUser();
    restoreSettled = true;
    emit();
    return currentUser;
  })();
  return bootRestore;
}

export async function login(email: string, password: string): Promise<WebUser> {
  const { data } = await authClient.post<WebLoginResponse>(`${WEB_AUTH_PREFIX}login/`, {
    email,
    password,
  });
  applySession(data.access_token, data.expires_in);
  currentUser = data.user;
  writeCachedUser(data.user);
  // A route guard running straight after login must not spend another refresh.
  bootRestore = Promise.resolve(data.user);
  restoreSettled = true;
  emit();
  return data.user;
}

export async function logout(): Promise<void> {
  // 204 and idempotent: succeeds with no cookie and no access token, which
  // matters because the access token has often expired by the time someone
  // signs out. A failure here still ends the local session.
  await authClient.post(`${WEB_AUTH_PREFIX}logout/`).catch(() => undefined);
  endSession();
}

/** Idempotent — N concurrent 401s all land here. */
export function endSession() {
  clearLocalState();
  emit();
}

function clearLocalState() {
  // Any path that clears the session has, by definition, settled the question.
  restoreSettled = true;
  accessToken = null;
  currentUser = null;
  clearTimeout(refreshTimer);
  refreshTimer = undefined;
  // Resolved, not null: a guard running after logout must see "no session"
  // rather than starting a fresh restore against a cookie we just cleared.
  bootRestore = Promise.resolve(null);
  clearCachedUser();
}

/** Test seam. Resets the module to its pre-boot state. */
export function __resetAuthStoreForTests() {
  restoreSettled = false;
  accessToken = null;
  currentUser = null;
  clearTimeout(refreshTimer);
  refreshTimer = undefined;
  inFlightRefresh = null;
  bootRestore = null;
  listeners.clear();
  try {
    localStorage.removeItem(USER_CACHE_KEY);
  } catch {
    // ignore
  }
}

function readCachedUser(): WebUser | null {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    return raw ? (JSON.parse(raw) as WebUser) : null;
  } catch {
    // A malformed cache means we cannot describe the user, so treat it as no
    // session and make them sign in again rather than rendering a broken shell.
    return null;
  }
}

function writeCachedUser(user: WebUser) {
  try {
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
  } catch {
    // Private browsing or a full quota. The session still works; the shell just
    // re-fetches the profile on the next login.
  }
}

function clearCachedUser() {
  try {
    localStorage.removeItem(USER_CACHE_KEY);
  } catch {
    // ignore
  }
}
