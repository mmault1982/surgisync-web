# Vendored API contract

Do not edit `openapi.yaml` by hand — it is a copy of the backend's published
contract. Refresh it with `pnpm api:pull`, then `pnpm api:gen`, and commit
both together.

|                        |                                    |
| ---------------------- | ---------------------------------- |
| Source                 | `http://localhost:8000/schema/v1/` |
| Pulled                 | 2026-08-05 14:47Z                  |
| Backend `data_version` | `569af2942f10`                     |

The backend enforces this file's accuracy on its own side: `openapi.yaml` is a
committed artifact there, CI fails on drift, and every response on
`/stock-items/`, `/inventory-kits/`, `/inventory-transfers/` and
`/api/v1/web/` is validated against it on every test run. Operations outside
those paths are documented but unverified — which is why `orval.config.ts`
generates from an explicit allowlist rather than the whole document.
