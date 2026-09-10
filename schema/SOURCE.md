# Vendored API contract

Do not edit `openapi.yaml` by hand — it is a copy of the backend's published
contract. Refresh it with `pnpm api:pull`, then `pnpm api:gen`, and commit
both together.

|                        |                                    |
| ---------------------- | ---------------------------------- |
| Source                 | `http://localhost:8000/schema/v1/` |
| Pulled                 | 2026-09-10 15:13Z                  |
| Backend `data_version` | `ebaba98b91d2`                     |

The backend enforces this file's accuracy on its own side: `openapi.yaml` is a
committed artifact there, CI fails on drift, and every response under a path in
its `VALIDATED_PATH_PREFIXES` is validated against it on every test run. Those
prefixes are `/api/v1/stock-items/`, `/api/v1/inventory-kits/`,
`/api/v1/inventory-transfers/`, `/api/v1/web/`, `/api/v1/parts/`,
`/api/v1/procedures/`, `/api/v1/directory/`, `/api/v1/integrations/`,
`/api/v1/shipments/` and the two `/api/v1/shipping/*-accounts/` collections.
Inside one the check is strict — a status with no documented JSON schema is
itself a failure. Operations outside them are documented but unverified, which
is why `orval.config.ts` generates from an explicit allowlist rather than the
whole document.

Keep this list in step with the backend's own tuple (`tests/openapi_schema.py`)
— and edit it in `scripts/pull-schema.sh`, not here: this file is regenerated
by every pull.
