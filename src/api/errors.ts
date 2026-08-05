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

export function errorMessage(error: unknown): string {
  const webError = asWebError(error);
  if (webError) {
    const known = MESSAGES[webError.code];
    // Fall back to the server's own text for a code this build predates.
    return known ?? webError.detail;
  }
  if (axios.isAxiosError(error) && !error.response) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  return 'Something went wrong. Please try again.';
}

/** The codes this app knows how to explain. Used by tests to assert coverage. */
export const KNOWN_ERROR_CODES = Object.keys(MESSAGES);
