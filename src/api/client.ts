import { currentEnv } from "../config/env";
import type { TokenStore } from "../auth/tokens";
import {
  ApiError,
  bestMessage,
  type Envelope,
  type LoginData,
  type Representative,
  type TokenPair,
} from "./types";

/**
 * Thin fetch client for the SurgiScribe API — a port of the iOS spike's
 * `APIClient.swift`.
 *
 * Authorized requests retry once after a 401 by refreshing the access token;
 * if the refresh itself fails, `onAuthFailure` fires so the session can bounce
 * to the login screen.
 */
export class ApiClient {
  /** Set by SessionProvider — called when the refresh token is dead. */
  onAuthFailure?: () => void;

  constructor(
    private readonly baseUrl: string = currentEnv.baseUrl,
    private readonly tokens: TokenStore,
  ) {}

  // ---- Endpoints ----------------------------------------------------------

  /**
   * POST login/ — on success stores the token pair.
   * Bad credentials arrive either as 400 with a field-error map or (backend
   * quirk) as HTTP 200 with a message and no `data`.
   */
  async login(email: string, password: string): Promise<TokenPair> {
    const { status, envelope } = await this.request<LoginData>("login/", {
      method: "POST",
      body: { email, password },
    });
    if (status !== 200 && status !== 400) {
      throw new ApiError("server", serverMessage(status, envelope));
    }
    const pair = envelope.data?.token;
    if (!pair) {
      throw new ApiError(
        "invalidCredentials",
        bestMessage(envelope) ?? "Invalid email or password.",
      );
    }
    this.tokens.store(pair);
    return pair;
  }

  /** GET representatives/ */
  representatives(): Promise<Representative[]> {
    return this.authorized("representatives/");
  }

  /**
   * POST logout/ — best-effort refresh-token blacklisting; errors are
   * swallowed because local logout must succeed regardless.
   */
  async logout(): Promise<void> {
    const refreshToken = this.tokens.refreshToken();
    if (!refreshToken) return;
    await this.request("logout/", {
      method: "POST",
      body: { refresh_token: refreshToken },
      bearer: this.tokens.accessToken() ?? undefined,
    }).catch(() => {});
  }

  // ---- Authorized requests with refresh-on-401 ----------------------------

  // TODO: if more pages are added, make the refresh single-flight so
  // concurrent 401s collapse into one token/refresh/ call.
  private async authorized<T>(path: string, isRetry = false): Promise<T> {
    const { status, envelope } = await this.request<T>(path, {
      method: "GET",
      bearer: this.tokens.accessToken() ?? undefined,
    });

    if (status === 401 && !isRetry) {
      await this.refresh();
      return this.authorized(path, true);
    }
    if (status < 200 || status >= 300 || envelope.data === undefined) {
      throw new ApiError("server", serverMessage(status, envelope));
    }
    return envelope.data;
  }

  /**
   * POST token/refresh/ — note the request field is `refresh`, not
   * `refresh_token`. Any failure here means the session is over.
   */
  private async refresh(): Promise<void> {
    const refreshToken = this.tokens.refreshToken();
    if (!refreshToken) {
      this.onAuthFailure?.();
      throw new ApiError("sessionExpired", SESSION_EXPIRED_MESSAGE);
    }
    try {
      const { status, envelope } = await this.request<TokenPair>("token/refresh/", {
        method: "POST",
        body: { refresh: refreshToken },
      });
      if (status !== 200 || !envelope.data) throw new Error("refresh rejected");
      this.tokens.store(envelope.data);
    } catch {
      this.onAuthFailure?.();
      throw new ApiError("sessionExpired", SESSION_EXPIRED_MESSAGE);
    }
  }

  // ---- Plumbing ------------------------------------------------------------

  private async request<T>(
    path: string,
    options: { method: string; body?: Record<string, string>; bearer?: string },
  ): Promise<{ status: number; envelope: Envelope<T> }> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (options.body) headers["Content-Type"] = "application/json";
    if (options.bearer) headers["Authorization"] = `Bearer ${options.bearer}`;

    let response: Response;
    try {
      response = await fetch(this.baseUrl + path, {
        method: options.method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch {
      throw new ApiError(
        "network",
        "Unable to reach the server. Check your connection and try again.",
      );
    }

    // Lenient parsing: throttle (429) and proxy errors may not be JSON.
    const envelope = (await response.json().catch(() => ({}))) as Envelope<T>;
    return { status: response.status, envelope };
  }
}

const SESSION_EXPIRED_MESSAGE = "Your session has expired. Please sign in again.";

function serverMessage(status: number, envelope: Envelope<unknown>): string {
  if (status === 429) return "Too many attempts. Please try again in a minute.";
  return bestMessage(envelope) ?? `The server returned an error (${status}).`;
}
