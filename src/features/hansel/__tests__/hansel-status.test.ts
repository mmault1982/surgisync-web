import { describe, expect, it } from 'vitest';

import type { HanselVerifyResult } from '@/api/generated/model';

import {
  credentialBadges,
  lastCheckedLabel,
  maskedSecret,
  readVerifyResult,
  verificationMessage,
  VERIFY_COPY,
} from '../hansel-status';

import { credentialFixture } from './credential-fixture';

function verifyResult(overrides: Partial<HanselVerifyResult> = {}): HanselVerifyResult {
  return {
    ok: true,
    error: '',
    message: '',
    checked_at: '2026-08-17T14:05:00Z',
    expires_in: 3600,
    ...overrides,
  };
}

const labels = (credential = credentialFixture()) =>
  credentialBadges(credential).map((badge) => badge.label);

/**
 * The copy a rejected check renders, insisting on the failed arm.
 *
 * The narrowing is doing real work: `VerifyOutcome` has no `message` on its
 * success arm, so a test that read one off the union would not compile — which
 * is the same guard that stops a component printing failure copy for a pass.
 */
function failureCopy(result: HanselVerifyResult): string {
  const outcome = readVerifyResult(result);
  if (outcome.kind !== 'failed') throw new Error('expected a failed check');
  return outcome.message;
}

describe('readVerifyResult', () => {
  it('reads a genuine success', () => {
    expect(readVerifyResult(verifyResult())).toEqual({
      kind: 'ok',
      checkedAt: '2026-08-17T14:05:00Z',
      expiresIn: 3600,
    });
  });

  it('treats anything that is not literally ok:true as a failure', () => {
    // The endpoint answers **200** when the credentials are rejected, so the
    // only thing separating a green tick from a red one is this check. A
    // truthiness test on a body that has lost its `ok` would show success.
    const missing = { checked_at: '2026-08-17T14:05:00Z' } as unknown as HanselVerifyResult;

    expect(readVerifyResult(missing).kind).toBe('failed');
    expect(readVerifyResult(verifyResult({ ok: false, error: 'invalid_credentials' })).kind).toBe(
      'failed',
    );
  });

  it('gives every documented code its own copy', () => {
    const codes = Object.keys(VERIFY_COPY);
    const messages = codes.map((code) => failureCopy(verifyResult({ ok: false, error: code })));

    expect(new Set(messages).size).toBe(codes.length);
    expect(messages.every((message) => message.length > 0)).toBe(true);
  });

  it('tells the user to re-enter the secret when the server cannot read it', () => {
    expect(failureCopy(verifyResult({ ok: false, error: 'credential_unreadable' }))).toMatch(
      /re-enter the client secret/i,
    );
  });

  it('falls back to the server text for a code this build predates', () => {
    expect(
      failureCopy(verifyResult({ ok: false, error: 'brand_new', message: 'Server said this.' })),
    ).toBe('Server said this.');
  });

  it('always says something, even for an empty failure', () => {
    // Both `error` and `message` are declared non-nullable and arrive as empty
    // strings, so a nullish fallback would leave the line blank.
    expect(failureCopy(verifyResult({ ok: false, error: '', message: '' }))).toBe(
      'Could not confirm these credentials.',
    );
  });

  it('normalises a null token lifetime rather than rendering one', () => {
    expect(readVerifyResult(verifyResult({ expires_in: null }))).toMatchObject({ expiresIn: null });
  });
});

describe('verificationMessage', () => {
  it('answers null for a code it does not know, so callers can fall back', () => {
    expect(verificationMessage('invalid_credentials')).toBeTruthy();
    expect(verificationMessage('brand_new')).toBeNull();
  });
});

describe('credentialBadges', () => {
  it('says Verified for a healthy, checked credential', () => {
    expect(labels()[0]).toMatch(/^Verified/);
  });

  it('puts an unreadable secret ahead of the green tick', () => {
    // The case this ordering exists for: a credential verified last week and
    // then restored into another environment still carries its
    // `last_verified_at`. "Verified" beside a secret this server cannot decrypt
    // is the one thing the row must never say.
    expect(labels(credentialFixture({ secret_readable: false }))).toEqual(['Secret unreadable']);
  });

  it('reports a failed check ahead of an older success', () => {
    expect(labels(credentialFixture({ last_verification_error: 'invalid_credentials' }))).toEqual([
      'Check failed',
    ]);
  });

  it('distinguishes never-checked from checked-and-failed', () => {
    expect(labels(credentialFixture({ last_verified_at: null }))).toEqual(['Not checked']);
  });

  it('flags a missing secret', () => {
    expect(labels(credentialFixture({ client_secret_set: false, last_verified_at: null }))).toEqual(
      ['No secret stored'],
    );
  });

  it('adds Inactive alongside the state badge rather than replacing it', () => {
    // The two answer different questions: whether the integration is switched
    // on, and whether its credentials work.
    expect(labels(credentialFixture({ is_active: false }))).toHaveLength(2);
    expect(labels(credentialFixture({ is_active: false }))[0]).toBe('Inactive');
  });
});

describe('maskedSecret', () => {
  it('shows which secret is stored without showing the secret', () => {
    expect(maskedSecret(credentialFixture())).toBe('•••• 9f2c');
  });

  it('says so plainly when nothing is stored', () => {
    expect(maskedSecret(credentialFixture({ client_secret_set: false }))).toBe('Not stored');
  });

  it('does not render an empty mask when the server sent no last4', () => {
    expect(maskedSecret(credentialFixture({ client_secret_last4: '' }))).toBe('Stored');
  });
});

describe('lastCheckedLabel', () => {
  it('says Never rather than leaving the row blank', () => {
    expect(lastCheckedLabel(credentialFixture({ last_verified_at: null }))).toBe('Never');
  });
});
