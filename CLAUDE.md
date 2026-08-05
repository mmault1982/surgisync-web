# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**SurgiSync Web** — a React/Vite spike, and a deliberate port of the native Swift/SwiftUI spike at `../app` (read its `CLAUDE.md`; several files here name their iOS counterpart in a header comment). Both explore a replacement for the Flutter app at `../surgiscribe-mobile-app` and talk to the SurgiScribe Django backend at `../surgiscribe-backend` (REST spec: `../surgiscribe-backend/openapi.yaml`). Scope is deliberately small: login, a representatives list, and logout.

## Commands

```sh
npm run dev        # Vite dev server on :5173, with the /api proxy
npm run build      # tsc --noEmit && vite build
npm run preview    # serve the production build
npm run test:e2e   # Playwright (starts the dev server itself)
```

Single test, by name or by file:line:

```sh
npx playwright test -g "wrong password shows inline error"
npx playwright test e2e/login-flow.spec.ts:20
```

There is **no linter or unit-test runner** — `tsc --noEmit` (strict, plus `noUncheckedIndexedAccess`) is the only static gate, and Playwright is the only test suite. Run `npx tsc --noEmit` alone for a fast typecheck without the bundle.

**The e2e tests hit the live backend**, so the local Django instance at `http://nomad.local:8000` must be running (`../surgiscribe-backend`). Test credentials: `admin@example.com` / `Test@123`. Smoke-check first:

```sh
curl -X POST http://nomad.local:8000/api/v1/login/ -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"Test@123"}'
```

Playwright runs **serially** (`workers: 1`, `fullyParallel: false`) because the backend's anonymous throttle is 10 req/min — parallelism turns into HTTP 429. `reuseExistingServer` is on, so an already-running `npm run dev` is reused.

## Architecture

**No router and no state library.** `App.tsx` switches `LoginPage` ⇄ `RepresentativesPage` on `session.state`; that is the entire navigation model. Adding real routing is a deliberate change, not a fill-in.

**`SessionProvider` (`auth/SessionContext.tsx`) is the single source of auth truth**, mirroring the iOS `Session`. It owns the one `ApiClient` instance and wires `api.onAuthFailure` to a local `expire()` that clears tokens and flips to `loggedOut`. Init is **optimistic**: a stored refresh token counts as logged in, and the first API call either refreshes or bounces to login.

**`ApiClient` (`api/client.ts`) centralizes the retry.** Authorized requests retry **once** after a 401 by calling `token/refresh/`; a failed refresh fires `onAuthFailure` and throws `sessionExpired`. The refresh call itself never enters the retry path. `logout/` failures are swallowed — local logout must succeed regardless.

- **Refresh is not single-flight** (there's a TODO in the file). Today only one page fetches, so concurrent 401s can't happen; adding a second data-fetching page requires fixing this first, because the backend rotates and blacklists refresh tokens.
- Relatedly, `main.tsx` **deliberately omits `<StrictMode>`** — its dev double-effects fire two concurrent refreshes and the second one 401s. Don't "restore" it without the single-flight fix.

**Tokens live in `localStorage`** (`auth/tokens.ts`, both access and refresh, behind a `TokenStore` interface). This is weaker than the iOS spike, which persists only the refresh token and keeps it in the Keychain — a known spike trade-off worth flagging before this becomes production code.

**Environment selection is compile-time, not env-var driven.** `config/env.ts` holds the local/staging/production table and `currentEnv` is a hardcoded reference — switching backends means editing that line. Local uses the **relative** base URL `/api/v1/`, routed through the Vite dev-server proxy (`vite.config.ts` → `nomad.local:8000`) because the backend's CORS config doesn't allow the Vite origin. Any new path constant must keep its trailing slash.

**Styling is Tailwind v4 via `@tailwindcss/vite`** — there is no `tailwind.config.js`. The theme is CSS-first in `src/index.css` under `@theme`, and the `brand` / `brand-dark` / `surface` / `error` tokens are carried over from the Flutter app's `app_colors_v2.dart`. Use those tokens rather than raw hex.

## Backend API gotchas

All verified against the live backend — easy to get wrong:

- **Trailing slashes are required** on every endpoint (`login/`, `representatives/`). A missing slash turns a POST into a redirect that drops the body.
- Responses are wrapped in `{"message", "data"}` (`Envelope<T>` in `api/types.ts`). `data` must stay optional: some invalid-credential responses are **HTTP 200 with no `data`**, which is why `login()` accepts both 200 and 400 and decides on the presence of `data.token`.
- Errors can also arrive as `{"message": "Error", "error": {field: [messages]}}` — the useful text is in the field map, not `message`. Use `bestMessage(envelope)`.
- Login returns tokens nested at `data.token.{access_token,refresh_token}`; token refresh returns them at `data.{...}`.
- Field-name mismatch: `token/refresh/` takes `{"refresh": ...}` but `logout/` takes `{"refresh_token": ...}`.
- Access token TTL is 10 min (hence refresh-on-401 matters); refresh 12 h. Anon throttle 10 req/min → HTTP 429 during repeated login testing, so `serverMessage()` special-cases it.
- Response parsing is lenient (`.catch(() => ({}))`) because 429s and proxy errors aren't necessarily JSON.
- `representatives/` is unpaginated, but most other list endpoints use a custom paginator (`{total_data, next, previous, current_page, total_pages, results}`) — check `openapi.yaml` before adding endpoints.
