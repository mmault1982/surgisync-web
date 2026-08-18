import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';

import {
  asConflict,
  asFieldErrors,
  asServiceFault,
  errorMessage,
  isForbidden,
  KNOWN_ERROR_CODES,
} from '@/api/errors';

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

  it('does not blame a deployment for a 503 Django raised itself', () => {
    // encryption_unavailable means the server holds no credential-encryption
    // key. "Try again in a minute" sends the user round a loop that cannot
    // close — this is the whole reason asServiceFault exists.
    const message = errorMessage(
      axiosError({ error: 'encryption_unavailable', message: 'Contact your administrator.' }, 503),
    );

    expect(message).not.toMatch(/try again in a minute/i);
    expect(message).toMatch(/retrying will not help/i);
  });

  it('falls back to the server text for a coded 503 this build predates', () => {
    expect(
      errorMessage(axiosError({ error: 'something_new', message: 'Server said this.' }, 503)),
    ).toBe('Server said this.');
  });

  it('explains a throttle that arrives as DRF, not as the web contract', () => {
    // DRF's 429 body is {detail: "…"} with no `code`, so asWebError misses it.
    // Verify is 10/min per user, so this is a button the user can reach.
    expect(errorMessage(axiosError({ detail: 'Request was throttled.' }, 429))).toMatch(
      /too many attempts/i,
    );
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

describe('asConflict', () => {
  it('reads the documented 409 body', () => {
    const conflict = asConflict(
      axiosError(
        { error: 'beacon_in_use', message: 'Beacon HSL-9 is attached to another kit.' },
        409,
      ),
    );

    expect(conflict).toEqual({
      error: 'beacon_in_use',
      message: 'Beacon HSL-9 is attached to another kit.',
    });
  });

  it('ignores every other status', () => {
    // The same shape at 400 is somebody else's contract, not this one.
    expect(asConflict(axiosError({ error: 'x', message: 'y' }, 400))).toBeNull();
  });

  it('does not mistake the other two error contracts for a conflict', () => {
    // A web error is {code, detail}; a field map is {field: [...]}. Neither has
    // a string `error` *and* a string `message`.
    expect(asConflict(axiosError({ code: 'invalid_credentials', detail: 'no' }, 409))).toBeNull();
    expect(asConflict(axiosError({ beacon_id: ['This field is required.'] }, 409))).toBeNull();
  });

  it('rejects a body whose values are the wrong type', () => {
    expect(asConflict(axiosError({ error: 1, message: 'y' }, 409))).toBeNull();
    expect(asConflict(axiosError({ error: 'x' }, 409))).toBeNull();
    expect(asConflict(axiosError(null, 409))).toBeNull();
  });

  it('ignores anything that is not an axios error', () => {
    expect(asConflict(new Error('boom'))).toBeNull();
  });

  it('leaves the coded 503 to asServiceFault', () => {
    // The two wear the same body. Loosening this status check would route
    // encryption_unavailable into conflict copy, which is about server state
    // the caller could change — and this one is not.
    expect(
      asConflict(axiosError({ error: 'encryption_unavailable', message: 'no' }, 503)),
    ).toBeNull();
  });
});

describe('asServiceFault', () => {
  it('reads the coded 503 Django raises', () => {
    expect(
      asServiceFault(
        axiosError({ error: 'encryption_unavailable', message: 'Contact an admin.' }, 503),
      ),
    ).toEqual({ error: 'encryption_unavailable', message: 'Contact an admin.' });
  });

  it('leaves a gateway 503 alone', () => {
    // An HTML error page has no `error` key, which is exactly what keeps the
    // deployment-window copy working for the case it was written for.
    expect(asServiceFault(axiosError('<html>gateway</html>', 503))).toBeNull();
  });

  it('ignores every other status', () => {
    expect(asServiceFault(axiosError({ error: 'x', message: 'y' }, 409))).toBeNull();
    expect(asServiceFault(axiosError({ error: 'x', message: 'y' }, 500))).toBeNull();
    expect(asServiceFault(new Error('boom'))).toBeNull();
  });
});

describe('isForbidden', () => {
  it('separates a permission answer from a failure', () => {
    expect(isForbidden(axiosError({ detail: 'Not permitted.' }, 403))).toBe(true);
    expect(isForbidden(axiosError({ detail: 'Not found.' }, 404))).toBe(false);
    expect(isForbidden(new Error('boom'))).toBe(false);
  });
});
