/**
 * The backend wraps custom endpoint payloads in `{"message", "data"}`, and
 * failures in `{"message": "Error", "error": {field: [messages]}}`.
 * `data` must stay optional: some invalid-credential responses come back as
 * HTTP 200 with a message and no data.
 */
export interface Envelope<T> {
  message?: string;
  data?: T;
  /** Django-style field error map, e.g. {"non_field_errors": ["Invalid email or password."]} */
  error?: Record<string, string[]>;
}

/** The most specific human-readable message available. */
export function bestMessage(envelope: Envelope<unknown>): string | undefined {
  if (envelope.error && typeof envelope.error === "object") {
    for (const messages of Object.values(envelope.error)) {
      if (Array.isArray(messages) && messages[0]) return messages[0];
    }
  }
  return envelope.message;
}

/**
 * JWT pair returned by `login/` (nested under `data.token`) and
 * `token/refresh/` (directly under `data`).
 */
export interface TokenPair {
  access_token: string;
  refresh_token: string;
}

/** The `data` object of a successful login; the spike only needs the tokens. */
export interface LoginData {
  user?: unknown;
  token?: TokenPair;
}

export interface Representative {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  email: string;
}

/** Full name, falling back to the email when both names are empty. */
export function displayName(rep: Representative): string {
  const name = [rep.first_name, rep.last_name].filter(Boolean).join(" ").trim();
  return name || rep.email;
}

export type ApiErrorKind =
  | "invalidCredentials"
  | "sessionExpired"
  | "server"
  | "network"
  | "decoding";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;

  constructor(kind: ApiErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = "ApiError";
  }
}

/** User-facing message for any thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Unable to reach the server. Check your connection and try again.";
}
