# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**SurgiSync Web** — the desktop web client for the SurgiSync inventory module, talking to the
SurgiScribe Django backend at `../surgiscribe-backend`. It replaced an earlier spike; none of the
spike's API layer survives, because the backend added dedicated browser auth endpoints with a clean
contract (see `../surgiscribe-backend/docs/tickets/surgisync-web-inventory.md`).

The UI spec is `../SurgiSoft/SurgiSync Inventory WebAdmin.html` — the desktop prototype. Use that
file, not `SurgiSync Desktop - Inventory.html`, which is superseded and has none of the column-filter
behaviour.

## Commands

```sh
pnpm dev          # Vite on :5173 (pinned), proxying /api to the backend
pnpm verify       # typecheck + lint + format:check + api:check + unit tests
pnpm test         # Vitest only
pnpm test:e2e     # Playwright (needs a seeded backend, see below)
pnpm api:pull     # refresh the vendored schema from the backend
pnpm api:gen      # regenerate the API client from the vendored schema
```

`pnpm verify` is the one command to run before saying something works. Run a single unit test with
`pnpm test src/auth/__tests__/auth-store.test.ts -t 'single-flight'`.

**pnpm, not npm.** The lockfile is `pnpm-lock.yaml`.

## The API client is generated — never hand-write a call

`src/api/generated/**` is orval output from `schema/openapi.yaml`. Do not edit it; `pnpm api:check`
fails the build if it differs from a fresh generation.

- **Adding a screen means adding its operationId to `ALLOWED_OPERATIONS` in `orval.config.ts`.** The
  contract has 143 operations; this app generates a handful, deliberately.
- **If a screen needs something the generated client cannot express, that is a backend schema bug.**
  Several endpoints outside `/stock-items/`, `/inventory-kits/`, `/inventory-transfers/` and
  `/api/v1/web/` declare a bare array while actually returning `{message, data}` — a generated client
  for those compiles and then fails at runtime, which is why they are not in the allowlist.
- The schema is **vendored**, not fetched at build time. `pnpm api:pull` refreshes it; commit the
  schema and the regenerated client together. Codegen must stay offline and deterministic.

Two generated things, treated differently on purpose:

|                        | committed? | why                                                                                                                                                                                                                                   |
| ---------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/api/generated/**` | **yes**    | Derived from an _external_ contract. The diff is the point — when the backend changes, you want to see what it did to the client, in review.                                                                                          |
| `src/routeTree.gen.ts` | **no**     | Derived from the local file tree. Its diff says nothing the route files do not already say, so committing it is pure noise. `pnpm typecheck` regenerates it first (`tsr generate`), so a fresh clone typechecks without a build step. |

## Auth: four invariants, each with a test

`src/auth/auth-store.ts` holds session state in **module scope, not React state** — the axios
interceptor is not a component and would otherwise read a stale closure, and the single-flight guard
has to be a true singleton. `auth-context.tsx` is a thin `useSyncExternalStore` subscriber.

1. **Refresh is single-flight.** `POST /api/v1/web/refresh/` _rotates_ the cookie: it blacklists the
   token it was given and sets the successor. Two concurrent refreshes present the same cookie, the
   second is rejected, and the backend **clears the cookie** — ending a healthy session. Never call
   the refresh endpoint outside `refreshAccessToken()`.
2. **The 401 interceptor excludes `/api/v1/web/*`.** Login 401s on bad credentials and refresh 401s
   on a dead cookie; routing either into the refresh path is an infinite loop that also burns the
   10/min login bucket.
3. **Boot restore is a real refresh call.** The cookie is httpOnly, so there is nothing readable to
   guess from — no optimistic "we have a token, assume logged in". `ensureRestored()` is memoised so
   the provider effect and every route guard share one request.
4. **The access token lives in memory only.** Never localStorage, never a readable cookie. The
   refresh token is never visible to JavaScript at all.

`<StrictMode>` is on. It was off in the spike because double effects fired two concurrent refreshes;
single-flight fixed that. Do not remove it.

## Traps that have already bitten

- **`paramsSerializer: { indexes: null }`** in `src/api/axios-instance.ts` is load-bearing. Array
  query params (`manufacturer_id`, `ownership_type`, …) must serialize as repeated bare keys. In
  axios, `null` does that; `false` produces `key[]` and `true` produces `key[0]`. With the wrong
  value the server's `getlist()` sees nothing, the filter is **silently ignored**, and the user gets
  an unfiltered page with no error. Regression-tested — do not "simplify" it away.
- **The dev server port is pinned (`strictPort: true`).** The backend's trusted-origin allowlist
  names `http://localhost:5173` exactly. Drifting to 5174 makes every `/api/v1/web/` call 403 with
  no clue why.
- **The Vite proxy is mandatory, not a CORS convenience.** The refresh cookie is host-only and
  `SameSite=Lax`; a page on `:5173` talking directly to the API on `:8000` would never receive or
  return it. The proxy makes the app same-origin with the API, as it will be when deployed.
- **Trailing slashes are required** on every backend path.

## Backend contract

Browser auth is `/api/v1/web/{login,refresh,logout}` — flat, typed responses, correct status codes,
and an httpOnly rotating refresh cookie. It is **not** the `{message, data, error}` envelope the
mobile endpoints use; do not reintroduce envelope handling.

Errors are `{code, detail, field_errors?}`. **Branch on `code`, never on the message** — `detail` is
display text and may change. `src/api/errors.ts` maps every documented code to distinct copy;
collapsing `account_pending` into "login failed" leaves a user retyping a password that was fine.

Access tokens last 10 minutes and carry `expires_in`, so the client refreshes proactively at T−60s
rather than waiting for a 401. Rate limits are IP-keyed: login 10/min, refresh 60/min.

## Structure

```
schema/            vendored openapi.yaml + SOURCE.md (where it came from)
src/routes/        file-based routing; _authenticated/ is the guarded layout
src/api/           axios instance (interceptors), errors, generated client
src/auth/          auth-store.ts (the invariants above) + a thin context
src/features/      one directory per screen — the shape later screens copy
src/components/    app shell and shared UI
src/test/          Vitest setup and MSW server
```

Conventions: kebab-case files, PascalCase exports, `@/` for imports from `src`. Tailwind v4 is
CSS-first — the theme lives in `src/index.css` under `@theme`, and the `brand` / `brand-dark` /
`surface` / `error` tokens come from the Flutter app. Use the tokens, not raw hex.

## Testing

**Vitest + MSW** for everything deterministic. **Playwright** only for what MSW cannot model:
httpOnly cookies, `Path=` scoping, and rotation. That is the whole e2e budget — five specs, not fifty.

E2E needs a seeded backend and `E2E_EMAIL` / `E2E_PASSWORD`; `e2e/global-setup.ts` fails fast with
instructions rather than letting specs time out. It is not in `pnpm verify` or CI yet, because
inventory seeding is still being added backend-side.
