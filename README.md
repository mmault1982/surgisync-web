# SurgiSync Web

Desktop web client for the SurgiSync inventory module.

## Getting started

Requires Node 22+ and pnpm.

```sh
pnpm install

# 1. Start the backend (in ../surgiscribe-backend)
docker compose up -d

# 2. Start the dev server — pinned to :5173, proxying /api to the backend
pnpm dev
```

The dev port is pinned deliberately: the backend's trusted-origin allowlist names
`http://localhost:5173` exactly, and a drifting port makes every auth call 403.
If the backend is somewhere other than `localhost:8000`, set `VITE_PROXY_TARGET`.

## Before you push

```sh
pnpm verify   # typecheck + lint + format + api:check + unit tests
```

## Working on this

See `CLAUDE.md` — it covers the auth invariants, the generated API client, and the
handful of traps that have already cost time.

## Deploying to staging

`app-staging.surgisoftsolutions.com` is one CloudFront distribution with two origins: the SPA from a
private S3 bucket, and `/api/*` + `/health/*` proxied to the staging ALB. The two-origin shape is not
a convenience — the refresh cookie is httpOnly, host-only and `SameSite=Lax`, so the app has to be
same-origin with the API for the cookie to be sent at all.

```sh
just deploy          # build, upload, invalidate /index.html
just smoke           # verify the live surface (works before DNS exists)
just diff-distribution   # is the live distribution still what infra/ says?
```

`infra/cloudfront-staging.json` and `infra/spa-router.js` are the source of truth for the
distribution and the SPA fallback; both carry the reasoning inline. Provisioning is AWS CLI in the
justfile, not IaC.
