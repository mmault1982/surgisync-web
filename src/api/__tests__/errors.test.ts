import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';

import { asFieldErrors, errorMessage, KNOWN_ERROR_CODES } from '@/api/errors';

function axiosError(data: unknown, status: number) {
  const error = new AxiosError('failed');
  error.response = {
    data,
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
  };
  return error;
}

function webError(code: string, detail = 'server text') {
  return axiosError({ code, detail }, 401);
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

  it('names a gateway failure instead of blaming the user', () => {
    // 502/503/504 come from CloudFront or the ALB, so the body is an HTML error
    // page with no `code` — the web-contract branch cannot see them. Every
    // backend deploy produces this window, because the prod service runs one
    // task at minimumHealthyPercent 0.
    for (const status of [502, 503, 504]) {
      const message = errorMessage(axiosError('<html>gateway</html>', status));
      expect(message).not.toBe('Something went wrong. Please try again.');
      expect(message).toMatch(/try again in a minute/i);
    }
  });

  it('still shows the generic message for a 500, which is the app failing', () => {
    // A 500 is Django raising, not a gateway gap; there is nothing useful to
    // tell the user about timescale, so it must not claim a deploy is underway.
    expect(errorMessage(axiosError('<html>oops</html>', 500))).toBe(
      'Something went wrong. Please try again.',
    );
  });

  it('keeps gateway statuses out of the documented-code contract', () => {
    // GATEWAY_MESSAGES is keyed on HTTP status, MESSAGES on the backend's
    // `code`. Merging them would break the coverage assertion above.
    expect(KNOWN_ERROR_CODES).not.toContain('502');
  });
});

describe('asFieldErrors', () => {
  it('reads DRF field errors off a 400', () => {
    const error = axiosError({ physical_location: ['Unknown location.'] }, 400);
    expect(asFieldErrors(error)).toEqual({ physical_location: ['Unknown location.'] });
  });

  it('leaves the web contract to asWebError', () => {
    // `{code, detail}` has string values, not arrays of them. Reading it here
    // would give a form two conflicting messages for the same failure.
    expect(asFieldErrors(axiosError({ code: 'validation_error', detail: 'Bad.' }, 400))).toBeNull();
    expect(errorMessage(axiosError({ code: 'validation_error', detail: 'Bad.' }, 400))).toBe(
      'Check the details you entered and try again.',
    );
  });

  it('ignores anything that is not a 400 field map', () => {
    expect(asFieldErrors(axiosError({ notes: ['Required.'] }, 500))).toBeNull();
    expect(asFieldErrors(axiosError(['Required.'], 400))).toBeNull();
    expect(asFieldErrors(axiosError({}, 400))).toBeNull();
    expect(asFieldErrors(axiosError({ notes: [1, 2] }, 400))).toBeNull();
    expect(asFieldErrors(new Error('not axios'))).toBeNull();
  });
});
