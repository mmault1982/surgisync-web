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
src/components/ui/ shadcn primitives (see below)
src/hooks/         hooks shadcn's components expect at `@/hooks` (currently just use-mobile)
src/test/          Vitest setup and MSW server
```

Conventions: kebab-case files, PascalCase exports, `@/` for imports from `src`.

### The app shell

`app-shell.tsx` → `app-sidebar.tsx` → `nav-main.tsx` / `nav-user.tsx`, with `nav-config.ts` as the
single source for both the nav links and the breadcrumb (`app-breadcrumb.tsx`), so the two cannot
disagree. Two things there are load-bearing:

- **`AppShell` owns sign-out, `NavUser` does not.** The logout → `router.invalidate()` →
  `navigate('/login')` ordering is an auth invariant; keeping it in the shell makes the menu a
  presentational component that tests with no auth store, no router and no MSW.
- **Active state comes from `useRouterState(pathname)`, compared in `nav-config.ts`.** Not
  `useMatchRoute`, which defaults to `includeSearch: true` and partially deep-equals the search
  params — on-hand has six of them, so the nav item would quietly stop looking active once you
  filtered. Not `Link`'s `activeProps` either: `SidebarMenuButton` owns `data-active`, and two
  sources of truth for one class is how they drift.

## Design system: shadcn/ui on Radix

Primitives live in `src/components/ui/`. Add one with:

```sh
pnpm dlx shadcn@latest add <component> && pnpm format
```

**The `pnpm format` is not optional** — shadcn emits double quotes at 80 columns, this repo is
`singleQuote` at 100, and `format:check` is inside `pnpm verify`.

`components.json` pins `style: "radix-nova"` and `baseColor: "neutral"`. **Neither can be changed
without reinstalling every component.** Radix rather than the newer Base UI default because the
backend ticket specifies it, and for the same reason `@tanstack/react-table` is pinned to v8: for a
mostly-LLM-written codebase, near-zero training data is the wrong trade.

`src/components/ui/**` is vendored but _ours to edit_ — that is the point of shadcn, and it is why
`eslint.config.js` relaxes a rule there rather than ignoring the directory the way
`src/api/generated` is ignored. The one relaxed rule is `react-refresh/only-export-components`:
shadcn exports `buttonVariants`/`badgeVariants` (a `cva()` call, so not a literal, so
`allowConstantExport` misses it) beside the component, and `pnpm lint` runs `--max-warnings 0`.

`shadcn` is a **runtime** dependency now — `src/index.css` does `@import 'shadcn/tailwind.css'`.
Do not run `shadcn eject`; it inlines that stylesheet and drops the dep, and it is irreversible.

### Tokens

Tailwind v4 is CSS-first; everything lives in `src/index.css`. **Use the tokens, not raw hex** —
there are no arbitrary colour values left in `src/`, and adding one is a regression.

The palette is the **prototype's** (`#C41E3A`), not the Flutter app's (`#C45149`). Those are
visibly different reds and every semantic colour differs too, so **web and mobile are knowingly
off-brand from each other**; the prototype wins here because it is the UI spec. `brand` /
`brand-dark` / `surface` / `error` still resolve, but they are now aliases of `primary` /
`brand-hover` / `background` / `destructive` so there is one source of truth. They are
transitional: move screens onto the semantic names as you touch them.

Beyond shadcn's set: `stripe-{red,amber,green,neutral}` for row stripes, and
`{success,warning,info}` with `-container` / `-foreground` pairs for the prototype's tinted pills.

Four deliberate divergences from the prototype, all of which look like bugs if you do not know:

- **Focus rings are kept.** The prototype expresses focus only as a border-colour change, which is
  not a visible focus indicator. shadcn's ring stays, tinted brand.
- **One neutral ramp.** The prototype mixes `#333/#666/#ddd` with a slate scale; that was
  collapsed rather than ported.
- **Nav hover is the brand tint, not `#f5f5f5`.** shadcn hovers to `sidebar-accent`; overriding it
  to the prototype's grey means the hover fights the active state on the active row.
- **No `#fafafa` strip behind the sub-nav.** Matching it means dropping `SidebarMenuSub`'s
  `mx-3.5 border-l px-2.5` for a hand-rolled full-bleed `pl-[42px]`. The indent guide is the better
  affordance; revisit if the fidelity matters.

The `--sidebar-*` tokens were picked for this nav and land on it exactly: `sidebar-accent` is
`.nav-parent.active`, `sidebar-primary` is `.nav-child.active`. shadcn applies the _accent_ pair to
both, so `nav-main.tsx` overrides the child to the primary pair — including
`[&>svg]:text-current`, because the base pins sub-icons to brand red and a brand-red icon on the
brand-red active row is invisible.

Dark mode is **not** implemented. `@custom-variant dark` pins it to an explicit `.dark` class that
nothing sets, so a stray `dark:` utility stays inert instead of firing on OS preference against
tokens that do not exist. Adding it later means authoring one `.dark { … }` block.

### `Popover` vs `DropdownMenu`

**Filter panels are `Popover`.** They hold checkboxes and text inputs. `DropdownMenu` implements
typeahead that eats keystrokes meant for a field, and its children want `menuitem` semantics.
`Popover` is the right primitive — it renders `role="dialog"`, which is what the e2e selectors match.

`PopoverContent` portals by default, and that is load-bearing: the table's `overflow-x-auto`
wrapper clips vertically too (one non-visible overflow axis computes the other to `auto`), so an
inline panel gets cut off. `column-menu.tsx` carries the full note.

**That rule is about filter panels, not menus in general.** Where the content is a list of commands
with no form controls, `DropdownMenu` is right and `menuitem` is the correct role. Two places use
it: the sidebar's user menu (`nav-user.tsx`), and the collapsed icon rail's submenu flyouts
(`nav-main.tsx`, which needs it because `SidebarMenuSub` is `display:none` in icon mode). Both are
matched in tests by `role="menuitem"` after opening the trigger — `e2e/auth.spec.ts` can no longer
see a bare `Sign out` button, which is why it opens the menu first.

## Testing

**Vitest + MSW** for everything deterministic. **Playwright** only for what MSW cannot model:
httpOnly cookies, `Path=` scoping, and rotation. That is the whole e2e budget — five specs, not fifty.

E2E needs a seeded backend and `E2E_EMAIL` / `E2E_PASSWORD`; `e2e/global-setup.ts` fails fast with
instructions rather than letting specs time out. It is not in `pnpm verify` or CI yet.

**The specs assert exact counts against one specific fixture**, so they only pass against the org
that command creates — pointed at any other user they fail on row counts in a way that looks like
a UI regression and is not:

```sh
docker compose exec web python manage.py seed_inventory_demo   # in ../surgiscribe-backend
# then, in .env:  E2E_EMAIL=e2e-0@surgisync.test  E2E_PASSWORD=E2E-seed-pw1!
```

Leave the `e2e-0` index in place — `e2e/fixtures.ts` rewrites the number per Playwright worker,
which is what keeps workers from sharing a login.

`playwright.config.ts` loads `.env` itself via `process.loadEnvFile`, because Playwright runs in
its own Node process and never sees Vite's. It is loaded there rather than in `global-setup.ts` on
purpose: global setup runs once in the runner, but the fixtures that need the credentials run in
workers, and workers re-import the config. Real environment variables still win over the file.

If a run dies with "Too many attempts", that is `web_login` at 10/min, IP-keyed. A full run spends
about six logins, so two runs inside a minute exhaust it — wait, or set
`THROTTLE_RATE_WEB_LOGIN=100/min` in the backend's `.env`.

**Component tests against Radix primitives need jsdom stubs.** Radix's popper measures its trigger
and calls pointer-capture methods on open; jsdom implements neither `ResizeObserver` nor
`hasPointerCapture`/`setPointerCapture`. `column-menu.test.tsx` has the stub block to copy. Note
what such a test can and cannot prove: it covers semantics (roles, label/control wiring, the
callbacks) but **not positioning** — there is no layout engine in jsdom, so collision handling,
flipping and clipping stay Playwright's job.

`window.matchMedia` is the exception: it is stubbed once in `src/test/setup.ts`, not per file.
jsdom implements none of it, and the sidebar's `useIsMobile()` calls it on mount, so _anything_
rendered inside the app shell needs it. jsdom's window is 1024px, so the desktop branch is what
renders and the mobile `Sheet` is Playwright's problem.
