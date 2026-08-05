import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';

import { errorMessage, KNOWN_ERROR_CODES } from '@/api/errors';

function webError(code: string, detail = 'server text') {
  const error = new AxiosError('failed');
  error.response = {
    data: { code, detail },
    status: 401,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
  };
  return error;
}

describe('error copy', () => {
  it('gives every documented code its own message', () => {
    const messages = KNOWN_ERROR_CODES.map((code) => errorMessage(webError(code)));

    // Distinctness is the point. Collapsing account_pending into "login
    // failed" leaves a user retyping a password that was never wrong.
    expect(new Set(messages).size).toBe(KNOWN_ERROR_CODES.length);
    expect(messages.every((message) => message.length > 0)).toBe(true);
  });

  it('distinguishes a blocked account from a bad password', () => {
    expect(errorMessage(webError('account_pending'))).not.toBe(
      errorMessage(webError('invalid_credentials')),
    );
  });

  it('falls back to the server detail for an unrecognised code', () => {
    expect(errorMessage(webError('something_new', 'Server said this'))).toBe('Server said this');
  });

  it('explains a network failure rather than showing a generic error', () => {
    const offline = new AxiosError('Network Error');
    expect(errorMessage(offline)).toMatch(/could not reach the server/i);
  });
});
