import type { HanselCredential, HanselVerifyResult } from '@/api/generated/model';
import { formatLogDateTime, formatRelative } from '@/lib/dates';

/**
 * What a stored credential looks like, as against what it says.
 *
 * Separate from `hansel-credentials.ts` for the reason `stock-status.ts` is
 * separate from `receive-kit.ts`: one module is about writing a value, this one
 * is about reading a state back, and they change for different reasons.
 */

/**
 * Copy for every code the credential check can report.
 *
 * Keyed on the machine code, never the message — `message` is display text the
 * backend may reword, and this app's wording says what to do next rather than
 * what went wrong. The same map renders `last_verification_error` on a row, so
 * a stored code and a live result read identically.
 */
export const VERIFY_COPY: Record<string, string> = {
  invalid_credentials:
    'Hansel rejected these credentials. Check the client ID, secret and workspace ID, then save them again.',
  service_unavailable:
    'Hansel could not be reached. This is usually temporary — run the check again shortly.',
  malformed_response:
    'Hansel replied with something we could not read. The credentials may still be fine; if this keeps happening, contact support.',
  credential_unreadable:
    'The stored secret cannot be read on this server. Re-enter the client secret.',
  not_configured:
    'This server is not configured to read stored credentials. Contact your administrator.',
};

export type VerifyOutcome =
  | { kind: 'ok'; checkedAt: string; expiresIn: number | null }
  | { kind: 'failed'; checkedAt: string; code: string; message: string };

/**
 * The check's answer, as two states rather than five optional fields.
 *
 * The trap this exists for: **verify answers HTTP 200 even when the credentials
 * fail.** `mutation.isSuccess` therefore means "we asked", not "they work", and
 * a component reading the raw result is one `!` away from showing a green tick
 * for a rejected secret. Only a literal `ok: true` is success here.
 */
export function readVerifyResult(result: HanselVerifyResult): VerifyOutcome {
  if (result.ok === true) {
    return { kind: 'ok', checkedAt: result.checked_at, expiresIn: result.expires_in };
  }
  const code = result.error || '';
  return {
    kind: 'failed',
    checkedAt: result.checked_at,
    code,
    // `||`, not `??`: both `error` and `message` are declared non-nullable and
    // are simply **empty strings** when the server has nothing to say, so a
    // nullish fallback would render a blank line where the explanation goes.
    message: verificationMessage(code) || result.message || 'Could not confirm these credentials.',
  };
}

/** House copy for a stored or returned failure code, or null for one we do not know. */
export function verificationMessage(code: string): string | null {
  return VERIFY_COPY[code] ?? null;
}

export type BadgeTone = 'ok' | 'warning' | 'bad' | 'muted';

export interface CredentialBadge {
  label: string;
  tone: BadgeTone;
}

/**
 * The badges on one credential row, in the order they should read.
 *
 * The ordering is the point, and it is why this is a tested function rather
 * than a chain of ternaries in the markup: **`secret_readable: false` outranks
 * a green tick.** A credential verified last week and then restored into a
 * different environment still carries its `last_verified_at`, and showing
 * "Verified" beside a secret this server cannot decrypt is the one lie the
 * screen must not tell.
 */
export function credentialBadges(credential: HanselCredential): CredentialBadge[] {
  const badges: CredentialBadge[] = [];

  if (credential.is_active === false) badges.push({ label: 'Inactive', tone: 'muted' });

  if (!credential.secret_readable) {
    badges.push({ label: 'Secret unreadable', tone: 'bad' });
  } else if (!credential.client_secret_set) {
    badges.push({ label: 'No secret stored', tone: 'bad' });
  } else if (credential.last_verification_error) {
    badges.push({ label: 'Check failed', tone: 'bad' });
  } else if (credential.last_verified_at) {
    badges.push({
      label: `Verified ${formatRelative(credential.last_verified_at) ?? ''}`.trim(),
      tone: 'ok',
    });
  } else {
    badges.push({ label: 'Not checked', tone: 'warning' });
  }

  return badges;
}

/** `•••• 4f9c`, or a plain statement when the server says nothing is stored. */
export function maskedSecret(credential: HanselCredential): string {
  if (!credential.client_secret_set) return 'Not stored';
  return credential.client_secret_last4 ? `•••• ${credential.client_secret_last4}` : 'Stored';
}

/** `Aug 17, 2:15 PM`, or `Never` — the row always says something here. */
export function lastCheckedLabel(credential: HanselCredential): string {
  return formatLogDateTime(credential.last_verified_at) ?? 'Never';
}
