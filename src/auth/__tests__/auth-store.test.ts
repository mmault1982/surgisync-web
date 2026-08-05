import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/api/axios-instance';
import { server } from '@/test/msw/server';

import { ensureRestored, login, logout, refreshAccessToken } from '../auth-store';

const REFRESH = '/api/v1/web/refresh/';
const LOGIN = '/api/v1/web/login/';
const LOGOUT = '/api/v1/web/logout/';
const PROTECTED = '/api/v1/stock-items/';

const USER = {
  id: 1,
  email: 'rep@example.com',
  name: 'Test Rep',
  role: 'non_admin',
  organization_name: 'Org',
  organizations: [],
};

function tokenResponse(token: string, expiresIn = 600) {
  return HttpResponse.json({ access_token: token, token_type: 'Bearer', expires_in: expiresIn });
}

describe('single-flight refresh', () => {
  /**
   * The invariant that protects live sessions.
   *
   * /api/v1/web/refresh/ rotates the cookie: it blacklists the token it was
   * given and sets the successor. Two concurrent refreshes present the same
   * cookie, the second is rejected, and the backend clears the cookie —
   * logging out a user whose session was perfectly healthy. Without this test
   * the bug is invisible until someone reports random sign-outs.
   */
  it('collapses concurrent callers into one request', async () => {
    let refreshCalls = 0;
    server.use(
      http.post(REFRESH, async () => {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return tokenResponse('fresh');
      }),
    );

    const results = await Promise.all([
      refreshAccessToken(),
      refreshAccessToken(),
      refreshAccessToken(),
      refreshAccessToken(),
      refreshAccessToken(),
    ]);

    expect(refreshCalls).toBe(1);
    expect(results).toEqual(['fresh', 'fresh', 'fresh', 'fresh', 'fresh']);
  });

  it('collapses concurrent 401s from ordinary requests into one refresh', async () => {
    let refreshCalls = 0;
    let protectedCalls = 0;

    server.use(
      http.post(REFRESH, () => {
        refreshCalls += 1;
        return tokenResponse('fresh');
      }),
      http.get(PROTECTED, () => {
        protectedCalls += 1;
        // Unauthorized until a refresh has happened, then fine.
        return refreshCalls === 0
          ? new HttpResponse(null, { status: 401 })
          : HttpResponse.json({ results: [] });
      }),
    );

    await Promise.all([
      api.get('/api/v1/stock-items/'),
      api.get('/api/v1/stock-items/'),
      api.get('/api/v1/stock-items/'),
    ]);

    expect(refreshCalls).toBe(1);
    expect(protectedCalls).toBe(6); // three 401s, then three retries
  });
});

describe('the 401 interceptor excludes the auth endpoints', () => {
  it('does not refresh when login returns 401', async () => {
    let refreshCalls = 0;
    server.use(
      http.post(REFRESH, () => {
        refreshCalls += 1;
        return tokenResponse('fresh');
      }),
      http.post(LOGIN, () =>
        HttpResponse.json(
          { code: 'invalid_credentials', detail: 'Email or password is incorrect.' },
          { status: 401 },
        ),
      ),
    );

    await expect(login('rep@example.com', 'wrong')).rejects.toThrow();

    // A refresh here would be an infinite loop, and would burn the 10/min
    // login bucket on every wrong password.
    expect(refreshCalls).toBe(0);
  });

  it('does not refresh when refresh itself returns 401', async () => {
    let refreshCalls = 0;
    server.use(
      http.post(REFRESH, () => {
        refreshCalls += 1;
        return HttpResponse.json(
          { code: 'refresh_token_invalid', detail: 'Your session is no longer valid.' },
          { status: 401 },
        );
      }),
    );

    expect(await ensureRestored()).toBeNull();
    expect(refreshCalls).toBe(1);
  });
});

describe('boot restore', () => {
  it('reports no session when there is no cookie', async () => {
    server.use(
      http.post(REFRESH, () =>
        HttpResponse.json(
          { code: 'refresh_token_missing', detail: 'No session cookie was sent.' },
          { status: 401 },
        ),
      ),
    );

    expect(await ensureRestored()).toBeNull();
  });

  it('is memoised, so a provider and a route guard share one request', async () => {
    let refreshCalls = 0;
    server.use(
      http.post(REFRESH, () => {
        refreshCalls += 1;
        return tokenResponse('fresh');
      }),
    );

    await Promise.all([ensureRestored(), ensureRestored(), ensureRestored()]);

    expect(refreshCalls).toBe(1);
  });

  it('restores the cached profile after a successful refresh', async () => {
    server.use(
      http.post(LOGIN, () =>
        HttpResponse.json({ access_token: 'a', token_type: 'Bearer', expires_in: 600, user: USER }),
      ),
      http.post(REFRESH, () => tokenResponse('b')),
    );

    await login('rep@example.com', 'pw');
    // A fresh page load would reset the module; simulate by clearing the
    // memoised promise the way __resetAuthStoreForTests does, minus storage.
    expect(await ensureRestored()).toEqual(USER);
  });
});

describe('proactive refresh', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('refreshes before the access token expires', async () => {
    let refreshCalls = 0;
    server.use(
      http.post(LOGIN, () =>
        HttpResponse.json({ access_token: 'a', token_type: 'Bearer', expires_in: 600, user: USER }),
      ),
      http.post(REFRESH, () => {
        refreshCalls += 1;
        return tokenResponse('b');
      }),
    );

    await login('rep@example.com', 'pw');
    expect(refreshCalls).toBe(0);

    // expires_in 600 with a 60s lead => fires at 540s.
    await vi.advanceTimersByTimeAsync(539_000);
    expect(refreshCalls).toBe(0);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(refreshCalls).toBe(1);
  });

  it('stops refreshing after logout', async () => {
    let refreshCalls = 0;
    server.use(
      http.post(LOGIN, () =>
        HttpResponse.json({ access_token: 'a', token_type: 'Bearer', expires_in: 600, user: USER }),
      ),
      http.post(LOGOUT, () => new HttpResponse(null, { status: 204 })),
      http.post(REFRESH, () => {
        refreshCalls += 1;
        return tokenResponse('b');
      }),
    );

    await login('rep@example.com', 'pw');
    await logout();

    // A leaked timer would keep refreshing a session the user ended, forever.
    await vi.advanceTimersByTimeAsync(600_000);
    expect(refreshCalls).toBe(0);
  });
});
