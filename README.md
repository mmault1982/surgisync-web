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
