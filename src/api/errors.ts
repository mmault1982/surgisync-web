import axios from 'axios';

import type { WebError } from '@/api/generated/model';

/**
 * Narrow an unknown thrown value to the backend's error contract.
 *
 * Every /api/v1/web/* failure returns `{code, detail, field_errors?}` where
 * `code` is the stable discriminator and `detail` is display text that may
 * change without notice — so branch on `code`, never on the message.
 */
export function asWebError(error: unknown): WebError | null {
  if (!axios.isAxiosError(error)) return null;
  const data = error.response?.data as Partial<WebError> | undefined;
  if (!data || typeof data.code !== 'string' || typeof data.detail !== 'string') return null;
  return data as WebError;
}

/**
 * Copy for each documented error code.
 *
 * Deliberately distinct per code: collapsing `account_pending` and
 * `invalid_credentials` into one "login failed" message is the difference
 * between a user waiting for an administrator and a user retyping a password
 * that was never wrong.
 */
const MESSAGES: Record<string, string> = {
  invalid_credentials: 'Email or password is incorrect.',
  account_pending: 'Your account is awaiting approval. Contact an administrator.',
  account_rejected: 'Your account request was declined.',
  account_blocked: 'Your account has been blocked. Contact an administrator.',
  validation_error: 'Check the details you entered and try again.',
  throttled: 'Too many attempts. Wait a minute and try again.',
  origin_not_allowed: 'This app is not permitted to sign in from here.',
  refresh_token_missing: 'Your session has ended. Please sign in again.',
  refresh_token_invalid: 'Your session has expired. Please sign in again.',
};

/**
 * Gateway failures, which are not the backend's error contract.
 *
 * A 502/503/504 comes from CloudFront or the ALB, not Django, so the body is an
 * HTML error page with no `code` and no `detail` — `asWebError` returns null and
 * `error.response` exists, so without this the user gets the same generic string
 * as a client-side bug. These are not in MESSAGES because that map is keyed on
 * the backend's `code`, and a gateway error has none; adding them there would
 * also break the KNOWN_ERROR_CODES coverage test, which asserts on documented
 * backend codes only.
 *
 * It matters more in production than it looks. `hoosier-service-prod` runs one
 * task at `minimumHealthyPercent: 0`, so every backend deploy kills the running
 * container before starting its replacement — the SPA keeps serving from S3 and
 * the API returns 5xx for a few minutes. "Something went wrong. Please try
 * again." tells a user to retry immediately and blame themselves; naming the
 * cause tells them to wait.
 */
const GATEWAY_MESSAGES: Record<number, string> = {
  502: 'The server is temporarily unavailable, usually during a deployment. Try again in a minute.',
  503: 'The server is temporarily unavailable, usually during a deployment. Try again in a minute.',
  504: 'The server took too long to respond. Try again in a minute.',
};

export function errorMessage(error: unknown): string {
  const webError = asWebError(error);
  if (webError) {
    const known = MESSAGES[webError.code];
    // Fall back to the server's own text for a code this build predates.
    return known ?? webError.detail;
  }
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return 'Could not reach the server. Check your connection and try again.';
    }
    const gateway = GATEWAY_MESSAGES[error.response.status];
    if (gateway) return gateway;
  }
  return 'Something went wrong. Please try again.';
}

/** The codes this app knows how to explain. Used by tests to assert coverage. */
export const KNOWN_ERROR_CODES = Object.keys(MESSAGES);

/** DRF's default 400: one array of messages per rejected field. */
export type FieldErrors = Record<string, string[]>;

/**
 * The *other* error contract.
 *
 * `{code, detail}` above is `/api/v1/web/*` only. Every other write in the
 * contract rejects a 400 with DRF's bare `{field: ["msg", …]}` map, which
 * `errorMessage` cannot read — it has no `code`, so it falls through to the
 * generic string. Screens that own a form want the per-field text instead.
 *
 * Not typed as the generated `ApiV1StockItemsPartialUpdate400`: that name is
 * scoped to one operation, and this shape is declared identically on every
 * write endpoint in the schema.
 *
 * The value check is what keeps the two contracts apart. A web error's values
 * are strings, not arrays of them, so `{code: 'validation_error', detail: '…'}`
 * fails here and is still caught by `asWebError`.
 */
export function asFieldErrors(error: unknown): FieldErrors | null {
  if (!axios.isAxiosError(error) || error.response?.status !== 400) return null;
  const data: unknown = error.response.data;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const entries = Object.entries(data);
  if (entries.length === 0) return null;
  const isMessageList = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((message) => typeof message === 'string');
  if (!entries.every(([, value]) => isMessageList(value))) return null;
  return Object.fromEntries(entries);
}

/**
 * A 404 from a resource endpoint.
 *
 * Separate from `errorMessage` because it is a routing outcome, not an error to
 * display: a kit that does not exist and a kit belonging to another
 * organization are deliberately indistinguishable here, and both want the
 * not-found screen rather than "Something went wrong".
 */
export function isNotFound(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

/**
 * The *third* error contract: a 409 `{error, message}`.
 *
 * Neither of the two above. `{code, detail}` is `/api/v1/web/*`, the bare
 * `{field: [...]}` map is every other 400 — and this one says the request was
 * well-formed but cannot be applied against current server state. `error` is
 * the stable code to branch on; `message` is display text that may change,
 * which is why callers map the code to their own copy and keep `message` only
 * as the fallback for a code they do not know.
 *
 * Typed structurally rather than as the generated `Conflict`, for the same
 * reason `asFieldErrors` avoids its per-operation twin: the shape is declared
 * identically wherever the contract raises one.
 *
 * The status check alone would be enough today, but the value check keeps this
 * honest if a 409 ever carries something else.
 */
export interface ConflictError {
  error: string;
  message: string;
}

export function asConflict(error: unknown): ConflictError | null {
  if (!axios.isAxiosError(error) || error.response?.status !== 409) return null;
  const data: unknown = error.response.data;
  if (typeof data !== 'object' || data === null) return null;
  const { error: code, message } = data as Record<string, unknown>;
  if (typeof code !== 'string' || typeof message !== 'string') return null;
  return { error: code, message };
}
