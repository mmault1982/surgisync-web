# Build the "Manufacturers" screen under a new Directory Profiles section

Read `CLAUDE.md` first and follow it. This brief adds facts you cannot get from the code; where it
names an exact endpoint, field, or rule, treat it as authoritative.

`docs/prompts/receive-load-kit-manual.md` is the sibling brief for the last screen that needed a new
backend endpoint before it could start. Where the two overlap — the blocking-prerequisite shape,
codegen plumbing, error mapping, test patterns — copy what is there rather than inventing a second
way.

## What this is

The app has one nav section today. This adds the **second**, and the first screen that manages
reference data rather than stock: a full create / read / update / delete surface for the
manufacturers an organization owns.

**The section is called "Directory Profiles", not "Reference".** That is the prototype's name —
`SurgiSoft/SurgiSync Inventory WebAdmin.html` has it as a 📁 section with four children (Facilities,
**Manufacturers**, Surgeons, Users), and `src/components/nav-config.ts`'s own comment already names
it among the seven sections still to arrive. **Only Manufacturers is built**; the other three get no
placeholder rows, per that same comment's standing policy that a section "arrives with the screens
behind it rather than as a row of dead links".

**There is no design spec for the page itself.** The prototype has the nav item and nothing behind
it; the FRD has no manufacturer-management section; the SOW has no line item. So the appearance
reference is Manage On-Hand's own conventions — `src/features/inventory/components/on-hand-table.tsx`
and the dialogs on Kit Detail — not a mockup. Do not invent product semantics to fill the gap; where
this brief is silent, copy the on-hand screen.

Five decisions were made before this brief and are not open:

1. **Section name is "Directory Profiles"**, ordered **above** Inventory, as in the prototype.
2. **Scope is the organization's own manufacturers**, via `Manufacturer.parent_company` — not the
   shared cross-tenant catalog. This is the load-bearing one; see immediately below.
3. **Name uniqueness becomes `(name, parent_company)`.** Today it is global.
4. **Writes are gated to org admins** (`IsOrganizationAdmin`). Reads are not.
5. **The writable surface stays on `/api/v1/manufacturers/`**, which enters
   `VALIDATED_PATH_PREFIXES` in the same PR. See "Which prefix, and why" below.

### Why not the shared catalog

`/api/v1/manufacturers/` today is a **global catalog**: `ManufacturerListView.get_queryset` applies
no organization filter at all, only `is_user_created=False`. Every tenant reads the same rows.

So a CRUD screen over it as-is would let any organization rename or soft-delete a manufacturer that
every other organization sees — and there is nothing to stop that today, because role gating is
[open decision 5](../../../surgiscribe-backend/docs/tickets/surgisync-web-inventory.md) and "any
authenticated org member can write". Two failure modes follow, neither of which announces itself:

- **A rename is global.** One organization tidying "Smith+Nephew" to "Smith & Nephew" changes it in
  every other organization's pickers, filters and saved URLs.
- **A delete is global, and nothing stops it.** `Part.manufacturer` is `on_delete=PROTECT`, so a row
  delete would be refused — but this delete is _soft_ (`deleted_at` + `is_active`), so `PROTECT`
  never fires. The manufacturer simply disappears from every tenant's lists while their parts and
  stock keep pointing at it.

Scoping to `parent_company` keeps the blast radius inside one tenant and needs no role model to be
safe, which is why it ships first. The shared catalog stays readable by everyone and writable by
nobody, which is what it is today.

This mirrors how `/parts/` (org-scoped) and `/manufacturers/` (global) already relate, so it is the
second instance of a pattern rather than a new idea.

## Blocking prerequisite: manufacturer write endpoints

**Do not start the screen until this has landed in `surgiscribe-backend`.** The contract today has
exactly one manufacturer operation:

```
GET /api/v1/manufacturers/   → list_manufacturers → PaginatedManufacturerList
```

No `POST`, no `/manufacturers/{id}/` path, and no `ManufacturerRequest` /
`PatchedManufacturerRequest` components. `drf-spectacular` emits those only when an operation
declares a request body, so their absence is direct evidence that no write operation is registered
for this model anywhere. `ManufacturerListView` is a `generics.ListAPIView` — 405 on every write verb
— and there is no `ManufacturerViewSet` in the backend. Per `CLAUDE.md`, that is backend work, not
something to work around here.

This is a **planned** feature, not a new question. `docs/tickets/company-table-consolidation.md`
shipped Phase 4 expressly to enable it:

> **Roadmap driving Phase 4 (from the product owner):** soon (not now) manufacturers will need
> **addresses**, and admins will need to **add/edit manufacturers**. Phase 4 is the prerequisite for
> both; the features themselves are the follow-ups noted below.

and its follow-up list already sketches the shape:

> 2. **Admin add/edit manufacturers** — flip `ManufacturerAdmin.has_add_permission`, create/link a
>    `Company` on add. **Requires fixing `Manufacturer.save()`'s `update_fields=['barcode']`
>    narrowing**, which silently drops non-barcode field writes on existing rows.

### Prerequisite zero: fix `Manufacturer.save()` before anything else

`inventory/models/manufacturer.py`:

```python
if self.name:
    ...
    self.barcode.save(barcode_filename, ContentFile(buffer.getvalue()), save=False)
    super().save(update_fields=['barcode'])   # ← discards every other changed field
```

On any existing row with a name — which is all of them — the final write persists **only**
`barcode`. A changed `name`, `parent_company` or `is_active` is silently dropped and the request
still answers **200**. A PATCH endpoint built on top of this is a silent data-loss bug of the worst
kind this codebase keeps meeting: **the contract's most dangerous failures are the ones that return
2xx.**

Fix it first, with its own tests. The Company ticket already flags the blast radius —
`inventory/admin/csv_processor.py`, the `migrate_manufacturer_barcodes` command, and the test
factory all depend on current behaviour.

While in that file, delete the stale comment on `company`: _"Nullable in stage 4a while backfilled;
becomes non-null in 4b"_ describes a stage already passed. The field is non-null now.

### The endpoints

Model them on **backend #40** (`/api/v1/parts/`), the established shape for a new scoped surface.

```
GET    /api/v1/manufacturers/          list_manufacturers          (exists — add org scoping)
POST   /api/v1/manufacturers/          create_manufacturer
GET    /api/v1/manufacturers/{id}/     retrieve_manufacturer
PATCH  /api/v1/manufacturers/{id}/     partial_update_manufacturer
DELETE /api/v1/manufacturers/{id}/     delete_manufacturer
```

- **Scope in `get_queryset`, never from the client.** Copy `_scope_to_org` from
  `inventory/views/parts.py` verbatim, including its superuser bypass and its "a user with no
  resolvable organization sees only the shared rows" branch. `get_user_org_ids` (`users/utils.py`)
  resolves memberships first, then the legacy profile FK. The same rule already runs in
  `get_manufacturer_kits`'s POST branch, so this is the third use, not the first.
- **`parent_company` is set from the caller's org on create**, never accepted from the body.
- **Gate writes with `IsOrganizationAdmin`** (`users/permissions.py`) via the `get_permissions()`
  pattern already in `inventory/views_pricing.py`. **Reads stay `IsAuthenticated`** — the receive
  forms' manufacturer picker must keep working for every user, and breaking it would take out a
  shipped screen.

  Open decision 5 in `docs/tickets/surgisync-web-inventory.md` does **not** block this. The reason
  blanket gating was rejected for stock writes — it would break the shipped Flutter app, which
  contains zero role references, and it contradicts FRD §3's grant to `REP` — applies to neither a
  brand-new endpoint nor a resource the FRD never grants reps.

- **Name writes go through `Company`.** `Manufacturer.name` is a one-way mirror of `company.name`
  (the model says so, and `Facility.name` works the same way), so a rename is a `Company` write plus
  the mirror. Create is find-or-create a `Company` by name, then the manufacturer — which is exactly
  what all four existing creation paths already do, `seed_inventory_demo._manufacturer()` included.
- **Delete is soft** — `deleted_at` + `is_active`, matching `ManufacturerAdmin.delete_queryset`. It
  must answer a documented status; note that a **bare serializer in `responses=` on a DELETE is
  silently rewritten to 204**, so use a status-keyed dict. That trap already bit
  `detach_inventory_kit_tracker`.

  **The view has to refuse a delete the database would not.** `Part.manufacturer` is
  `on_delete=PROTECT`, so a row delete of a referenced manufacturer is impossible — but a soft delete
  never triggers `PROTECT`. Left to itself it succeeds, the manufacturer vanishes from every list,
  and its parts and their stock keep pointing at a row nothing will show. Check for referencing
  `Part` rows in the view and refuse with a documented 409 carrying the count, so the client can say
  what is in the way. This is the same family as the traps already recorded in the ticket — **the
  contract's most dangerous failures are the ones that return 2xx** — and here the 2xx would be a
  DELETE that reports success while orphaning stock.

- **Keep barcode generation off the request thread.** Every production create path bypasses
  `Manufacturer.save()` with raw SQL because rendering a Code128 PNG and uploading it to S3 inline
  _"tripped OOM on staging's 960 MB container on 2026-04-23"_. Either bypass it the same way or defer
  to the existing `generate_barcodes` batch command. Do not quietly reintroduce it.

### The migration

`unique_active_manufacturer` is currently `UniqueConstraint(fields=['name'],
condition=Q(deleted_at=None))` — **globally unique on name, with no tenant in the key**. Rescope it
to `(name, parent_company)`.

This is not tidying. Today `create_case_item`'s lookup is
`Manufacturer.objects.filter(name=manufacturer_name).first()` — global and unscoped — so an
organization typing a name another organization already added **silently binds to that other
organization's row**. Rescoping the constraint is what makes "my organization's manufacturers" a
truthful phrase.

Phase 3 of the Company consolidation did exactly this for tenant names and records it as _"a
deliberate divergence"_, so there is precedent to cite rather than a new argument to make.

### Which prefix, and why

`/api/v1/manufacturers/` is outside `VALIDATED_PATH_PREFIXES` because `get_manufacturer_kits` and
`get_manufacturer_kits_by_ids` share the prefix declaring `200` with no content schema at all, and
the gate is strict inside a prefix. The tempting move is #40's — a brand-new prefix, gated from its
first commit, sidestepping the squatters.

**Do not take it here.** #40's new path was a genuinely new resource; this would be a second spelling
of one that already exists, and this codebase has cause to regret that — `VALIDATED_PATH_PREFIXES`
carries `/api/v1/inventory-kits/` solely because it is "the deprecated spelling of the same viewset",
and its comment says listing it "is not optional". Buying a second manufacturers path to avoid
documenting two legacy operations trades a bounded chore for a permanent ambiguity.

**Document the two legacy operations and gate the existing prefix**, closing a deferred item the
ticket has now recorded twice. Both are fully documentable from
`inventory/views/manufacturers.py` — the shapes are deterministic:

```jsonc
// 200, both operations
{
  "message": "Filtered kits by manufacturer IDs [...] with search \"...\"",
  "data": [
    {
      "manufacturer_id": 5,
      "manufacturer_name": "Treace",
      "kits": [{ "kit_id": 1, "kit_uuid": "…", "kit_name": "…", "number_of_items": 3 }],
    },
  ],
}
```

Two things to know before starting that:

- **They emit a fourth error shape.** `hoosier/error_schemas.py` documents three (`{detail}`,
  `{field: [...]}`, `{error, message}`); these return a bare `{message}` for their 400s and 404s, and
  `{message, error}` for invalid ids. Document what they actually send — do **not** "fix" them into
  one of the three, because the shipped Flutter app reads them.
- **Coverage genuinely rises.** 13 call sites across 9 test files already exercise these two
  operations, including `tests/security/test_multi_tenancy_isolation.py` and two regression suites.
  So the ticket's standing warning — that gating a prefix most tests never call "is indistinguishable
  from passing" — does not apply, but do confirm it rather than assume, the way #40 did.

Add the prefix to `VALIDATED_PATH_PREFIXES` in the same commit as the documentation, and run
`just schema` in the same change; CI fails on drift.

### What is _not_ blocked

`list_manufacturers` is already allowlisted and generated — `useListManufacturers` exists at
`src/api/generated/endpoints/inventory/inventory.ts`, typed, with `search`, `has_items`, `page` and
`page_size`. So the read half of this screen can be built and reviewed against the current contract
while the write endpoints are in flight, if that sequencing is useful.

Note `ManufacturerCatalogPagination` defaults to **500 rows per page**, capped at 1000 — one request
holds the whole catalog at present sizes. Do not take that as licence to skip pagination in the UI:
the org-scoped list is a different, smaller set, but the component should page anyway, and
`src/features/inventory/components/pagination.tsx` already exists.

Read `results`, never the deprecated `data` key that duplicates it for shipped Flutter builds. There
is a test on the receive form's picker for exactly that, and it is the pattern to copy.

## The screen, top to bottom

### 1. Nav and route

Two files, plus the route. `app-sidebar.tsx`, `nav-main.tsx`, `app-breadcrumb.tsx` and
`app-shell.tsx` are all generic over the config and must not be edited.

```ts
// src/components/nav-config.ts — first in NAV_SECTIONS, above Inventory
{
  title: 'Directory Profiles',
  icon: FolderIcon,
  items: [{ title: 'Manufacturers', to: '/directory/manufacturers', icon: FactoryIcon }],
}
```

`src/routes/_authenticated/directory/manufacturers.tsx` is a thin route — copy
`src/routes/_authenticated/inventory/receive.tsx`. **A section needs no layout route**; `inventory/`
has none, and the section exists as a URL prefix plus a nav-config entry.

`to` is typed as `LinkProps['to']`, so the route file must exist and `tsr generate` must have run
before `nav-config.ts` compiles. `pnpm typecheck` does both, and is the loop.

### 2. The table

Copy Manage On-Hand's structure, not its size. Columns: **Name**, **Barcode** (present / absent, not
the image), and a row actions cell. Sorting and per-column filter menus are **out of scope** — this
list is small and the column-menu machinery exists for a ten-column table with six array filters.

A search box over `?search=` and pagination are in scope. URL search params, validated by a zod
schema in the feature directory with **every field `.catch(...)`-guarded** — copy
`src/features/inventory/on-hand.search.ts` and cut it down to `page`, `page_size`, `search`.

**`@tanstack/react-table` is a dependency this codebase uses nowhere**, and
`src/components/ui/table.tsx` has zero importers. `on-hand-table.tsx` is hand-rolled `<table>` markup
over a local `COLUMNS: Column[]` array where each entry owns **both** its header and its `cell`
renderer. Keep that: header list and cell markup were once two parallel arrays, and swapping two
`<td>`s rendered the wrong field under the right header while passing `tsc`, lint and every test.

Loading, empty and error states come from `src/features/inventory/components/table-states.tsx`, and
pagination from `pagination.tsx`. Both are already generic. **Promote them to `src/components/`**
rather than importing across feature directories — this is the second consumer, which is the moment
that stops being premature.

### 3. Create and edit

**One dialog, seeded differently** — an empty form for create, the row's values for edit. The fields
are `name` and nothing else; `barcode` is server-generated and `parent_company` comes from the
session, so neither is a form control.

`Dialog`, not `AlertDialog`. Mount it only while open (`{open && <ManufacturerDialog … />}`) so
staged state cannot outlive a close, and pass `open` as a bare attribute with
`onOpenChange={(next) => { if (!next) onClose(); }}` — see `kit-actions.tsx` for the mounting idiom.

Form state is **plain `useState` seeded from a factory**, with a pure `validateManufacturer(values)
→ Errors` function in a sibling `.ts`. `react-hook-form` is a dependency used exactly once, in
`src/features/auth/login-form.tsx`; do not reach for it here. zod is for URL search params only.

### 4. Delete

`AlertDialog`, and copy `detach-tracker-dialog.tsx` including the two non-obvious parts: the action's
`onClick` calls `event.preventDefault()` so the dialog survives a failure and the error has somewhere
to render, and `onOpenChange` is guarded on `!isPending` so an in-flight request cannot be closed out
from under.

Say what delete means in the copy. It is a soft delete — the manufacturer stops appearing, it is not
erased — so do not promise "permanently".

**The 409 for a manufacturer with parts behind it is the case to get right**, because it is the one a
user will actually hit and the one the database will not catch for you (see the endpoints section).
Render the server's count rather than a generic failure: "Beta Devices has 12 parts and cannot be
removed" tells the user what to do next; "Delete failed" does not. Branch on the code via
`asConflict`, never on the prose.

## Saving

Every mutation carries **`retry: false`** with a written reason. A retried POST creates a second
manufacturer, and unlike a kit there is no natural key the user would notice it by.

On success, `void queryClient.invalidateQueries({ queryKey: directoryKeys.all })` and close the
dialog. **Closing is the feedback** — there is no toast in this app, and adding one is out of scope.
Where a screen stays open after a write, the established substitute is an inline
`<p role="status">`; see the receive form.

**Invalidate the catalog too.** The receive forms' manufacturer picker reads
`catalogQueries.manufacturers()` under `catalogKeys`, and a newly created manufacturer that does not
appear there until a reload is a bug the user will read as "it did not save". This is the first
screen whose writes cross two query roots — say so in a comment, because
`src/features/inventory/inventory.keys.ts` documents the roots as deliberately separate.

Server field errors map through `asFieldErrors` (`src/api/errors.ts`) plus a `FIELD_SLOTS` map local
to this form — copy `skuFieldErrors` / `skuSaveErrorMessage` from `receive-sku.ts`. The rule that
matters: **nothing the server said goes unshown.** Slotted fields render under their input, unslotted
fields become the form-level `<p role="alert">`, and anything else falls back to `errorMessage()`.

Expect a **409 or a 400 on the uniqueness constraint** once it is scoped to `(name, parent_company)`.
Branch on the code, never the prose — `src/api/errors.ts` has `asConflict` for the `{error, message}`
shape, added when beacon conflicts needed it.

## Plumbing (read `orval.config.ts`'s header comment first)

Add the new operationIds to `ALLOWED_OPERATIONS`, then `pnpm api:pull` and `pnpm api:gen`, committing
`schema/` and `src/api/generated/` together. `pnpm api:check` fails the build if they differ from a
fresh generation.

If the prefix has landed in `VALIDATED_PATH_PREFIXES` by then, drop the caveat comment currently
attached to `list_manufacturers` — it exists only to record that the prefix was ungated, and leaving
a stale warning is worse than none.

Feature layout, copying the `receive-*` split:

```
src/features/directory/
  manufacturers.search.ts     zod URL-search schema
  manufacturers.queries.ts    queryOptions factories
  manufacturers.ts            values, validate, buildBody, FIELD_SLOTS — no DOM in sight
  directory.keys.ts           query keys, rooted separately
  components/
    manufacturers-screen.tsx        owns navigation and mutations
    manufacturers-table.tsx         presentational, props only
    manufacturer-dialog.tsx         create + edit
    delete-manufacturer-dialog.tsx  AlertDialog
```

**The generated react-query hooks are never used in this codebase.** orval emits them; every import
from `@/api/generated/endpoints/**` is the plain fetcher, wrapped in a hand-written `queryOptions()`
factory keyed from a `*.keys.ts`. Follow that.

## Testing (Vitest + MSW; no new Playwright)

Two flavours, both established:

- **Pure logic** — no React, no MSW. Import the exported functions directly and assert **omissions**
  as hard as inclusions; see `receive-sku.test.ts`.
- **Component** — MSW handlers registered with `server.use(...)` in `beforeEach`. There is no central
  handler file, and `onUnhandledRequest: 'error'` means an unmocked call is a failing test. Query by
  role or label, never test-ids. Radix needs the jsdom stub block (`ResizeObserver`,
  `hasPointerCapture`, …) — copy it from `receive-sku-form.test.tsx`.

Assert the **wire body** by capturing it into a module-level array, not just the rendered result.
That is what caught the two silent-success bugs on the receive screens.

`src/components/__tests__/nav-config.test.ts` already iterates the whole config, so the new section
is covered on arrival. Add one explicit assertion that `/directory/manufacturers` resolves to
Directory Profiles › Manufacturers.

**No new Playwright spec.** The e2e budget exists only for what MSW cannot model — httpOnly cookies,
`Path=` scoping, rotation — and a table with two dialogs is none of those.

## Explicitly out of scope

- **Facilities, Surgeons and Users.** The prototype's section has all four; only Manufacturers is
  built, and the other three get no placeholder rows.
- **Per-column sort and filter menus.** `column-menu.tsx` exists for a ten-column table; this is not
  one.
- **Manufacturer addresses.** The Company ticket names them as the _other_ Phase 4 follow-up, and
  they need `AddressInline` surfaced on `Company` first.
- **Backfilling the existing `is_user_created=True` rows.** They were created by Add Missing Item
  with `parent_company = NULL`, which makes them shared-catalog rows visible to every tenant, and
  `ManufacturerListView`'s `is_user_created=False` filter then hides them from their own creator —
  so they are invisible on every surface today while `inventory_sync` protects them from cleanup.
  **Leave them.** Nothing records who created them, so assigning them to an organization is
  guesswork. This is a decision, not an oversight; the backend PR should say so in its description.
- **Repurposing `is_user_created` as the tenancy marker.** It is a provenance flag. Filtering on it
  instead of `parent_company` would surface every organization's ad-hoc vendor names to every other
  organization.
- **A toast system.** Closing the dialog is the success signal.
