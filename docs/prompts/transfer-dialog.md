# Build the "Transfer" dialog on Kit Detail

Read `CLAUDE.md` first and follow it. This brief adds facts you cannot get from the code; where it
names an exact endpoint, field, or rule, treat it as authoritative.

`docs/prompts/update-status-dialog.md` is the sibling brief for the dialog that already shipped.
Where the two overlap — dialog shell, photo staging, error shapes, test patterns — copy what is
there rather than inventing a second way.

## What this is

The Kit Detail screen (`src/routes/_authenticated/inventory/on-hand_.$stockItemId.tsx`) renders an
Actions column (`src/features/inventory/components/kit-actions.tsx`) whose **Transfer** card is a
deliberate no-op. Build the dialog behind it: a modal that moves **one** kit from its current
assignment to another representative or facility, creating one `InventoryTransfer` record and
putting the kit in transit.

Feature behaviour is specified by the **mobile app** (already shipped):
`surgiscribe-mobile-app/lib/app/modules/inventory/controllers/transfer_kit_controller.dart` and
`views/transfer_kit_sheet.dart`. The desktop mockup — `mTransfer()` in
`SurgiSoft/SurgiSync Inventory WebAdmin.html` — informs **appearance only**. Where this brief
spells out behaviour, it is the mobile behaviour.

Three decisions were made before this brief and are not open:

1. **Single kit only.** The API takes an array of stock items and mobile drives it from a bulk
   selection; this dialog sends an array of exactly one. Build the payload builder as
   `stock_items: number[]` so multi-kit is a later _caller_, not a rewrite, but ship no bulk UI, no
   multi-kit banner and no in-transit skip list.
2. **Expired kits are not restricted.** The prototype locks an expired kit to "Warehouse only" with
   Reason forced to Return. Mobile has no such rule and the backend has no Warehouse concept, so it
   is not this product's. Show the expired banner as information (same treatment as Update Status),
   restrict nothing — and **delete the now-dead `· to Warehouse only` annotation** from the
   `transfer` action in `kit-actions.tsx`, which promises a restriction nothing implements.
3. **The picker options come from a new backend endpoint**, which does not exist yet. See below.

## Blocking prerequisite: a transfer-targets endpoint

**Do not start the dialog until this has landed in `surgiscribe-backend`.** Mobile fills its From/To
dropdowns from `/api/v1/representatives/` and `/api/v1/facilities/`. The web client cannot do the
same: `list_facilities` **declares a bare array and actually returns `{message, data}`**
(`inventory/views/lookups.py:100-128`) — one of the 13 known-bad operations enumerated in the
backend ticket's §0.4. A generated client for it compiles and fails at runtime. Per `CLAUDE.md`,
that is a backend schema bug, not something to work around here.

Specify and land this first:

```
GET /api/v1/inventory-transfers/targets/
operationId: list_inventory_transfer_targets
```

- **Path matters.** `/api/v1/inventory-transfers/` is already in `VALIDATED_PATH_PREFIXES`
  (`tests/openapi_schema.py`), so the new endpoint is inside the response-accuracy gate the moment
  it exists — unlike `/api/v1/trackers/`, which the Kit Detail work had to allowlist ungated.
- **Response** — a new component, not `FacetResponse`, because ids collide across the two tables:

  ```yaml
  TransferTargetResponse: { results: TransferTarget[] }
  TransferTarget: { type: 'representative' | 'facility', id: integer, name: string }
  ```

- **Contents**, ordered representatives first then facilities, each block sorted by name — matching
  `loadTargets()` in `transfer_kit_controller.dart`:
  - _representatives_: the same query `list_representative` uses (`users/views.py:657-674`) — active
    users in the requesting user's primary-entity organization. `name` is
    `get_full_name()` falling back to `email`, so it is never blank.
  - _facilities_: the same scoping `list_facility` uses — active facilities, narrowed to the user's
    `FacilityAssignment`s, falling back to all active facilities when the user has none.
- **Organizations are deliberately not offered**, matching mobile. The kit's current assignment may
  nonetheless _be_ an organization (see below), which the From field has to survive.
- Document `401`/`403` like the facet endpoints do, and confirm the accuracy gate actually covers
  the new path — §0.4's warning applies: a gate that matches nothing looks identical to one that
  passes.

Everything below assumes that endpoint exists and is in the vendored schema.

## The data model (why From/To work the way they do)

A transfer stores each side as **three nullable FK columns**, not one polymorphic reference:
`{from,to}_assigned_to_parent_company`, `_representative`, `_facility`. A picker value is therefore
`{type, id}` collapsed into one selectable option and expanded back into exactly one column on save
— mobile models this as `TransferTarget` with `_applyTarget()` in `models/kit_transfer.dart`. Copy
that shape.

**Two ids can be equal across types**, so a representative and a facility can both be `id: 4`. Every
`SelectItem` value, React key and equality check must use a composite `` `${type}:${id}` `` string.
A bare numeric id here silently selects the wrong destination.

**Pre-fill From from the kit's own assignment.** `InventoryKitDetail` carries
`assigned_to_representative`, `assigned_to_facility` and `assigned_to_parent_company` (ids) beside
`assigned_to_name` and `assigned_to_facility_name`. Whichever id is non-null is the current
assignment. When it is the **parent company**, no fetched option will match it — organizations are
not offered — so inject that one value into the options list so a pre-filled From still renders and
can be re-selected. Mobile does exactly this (`loadTargets()`, the `preset` insert). When no id is
set, leave From empty; it is still required.

## Dialog contents, top to bottom

Use the vendored shadcn `Dialog`, sized like Update Status (`sm:max-w-xl`, body `max-h` +
`overflow-y-auto`). Lean on the vendored primitives throughout — `Select`, `Textarea`, `Label`,
`Button`, `Badge`, `Popover` are all already in `src/components/ui/`. Tokens only, no raw hex.

Field order is the one mobile and the prototype agree on:

1. **Header** — title "Transfer Kit", the Dialog's built-in close.
2. **Kit summary card** (muted panel): `part_name`, `manufacturer_kit_id` in mono (`—` when null),
   ownership pill via `ownershipLabel` (`src/features/inventory/kit-detail.ts`). Identical to the
   Update Status summary — extract it rather than copying it a second time.
3. **Expired banner — display only.** Reuse the exact treatment in `update-status-dialog.tsx`
   (destructive left border, `BanIcon`), keyed off `isExpired(kit)`.
4. **From → To route preview.** A `success-container` panel, border `success`: `FROM` / value,
   an arrow, `TO` / value, each falling back to `—`. It updates live as the two selects change, and
   it is the reason those selects are worth having above the fold. Hide the whole strip while both
   sides are empty.
5. **Transfer From \*** — `Select` over the fetched targets, pre-filled as described above.
6. **Transfer To \*** — same options, placeholder "Select destination...". Nothing stops To from
   equalling From; the backend does not reject it and neither does mobile.
7. **Reason \*** — `Select`, default **Surgery**. Exactly four options, from `ReasonEnum`:
   `surgery` Surgery · `restock` Restock · `return` Return · `other` Other. The prototype also lists
   "Reallocation"; it is not in the backend enum, so it does not exist here.
8. **Transfer Date \*** — defaults to today, sent as `YYYY-MM-DD`. Use shadcn's `Calendar` inside the
   vendored `Popover` (`pnpm dlx shadcn@latest add calendar && pnpm format`); it is the one new
   primitive this screen needs and it pulls `react-day-picker`. No bounds — back-dating a hand-off
   and scheduling a future one are both real, and mobile allows both. Display through
   `formatCalendarDate` (`src/lib/dates.ts`) so it reads like every other date in the app; do not
   build a `Date` from the bare `YYYY-MM-DD` string, which is UTC midnight and renders a day early
   west of Greenwich.
9. **Transport Method \*** — `Select`, placeholder "Select how it's being transported...". **Three**
   options, not the enum's four: `rep` Rep Transport · `fedex` FedEx · `ups` UPS. `TransportMethodEnum`
   also has `other`, which mobile deliberately does not surface.
10. **Current Status** — read-only. Render `statusLabels(kit)`
    (`src/features/inventory/stock-status.ts`) as small pills. Mobile shows this so the user can see
    what state the kit is going out in; it is not editable here.
11. **Required Photos \*** — conditional on transport method, and the only genuinely reactive part
    of the form:
    - **No method chosen**: a muted placeholder panel, "Select a transport method to see required
      photos". No capture controls at all.
    - **Rep Transport**: one **Kit Photo** tile ("Before hand-off"), plus muted helper text
      "Shipping label not required — rep is hand-carrying."
    - **FedEx / UPS**: two tiles side by side — **Kit Photo** ("Before boxing") and **Shipping
      Label** ("{FedEx|UPS} tracking label").
    - A kit photo is required for **every** method; the label photo only for FedEx/UPS. Switching
      from a carrier to Rep Transport **clears any staged label photo** (mobile resets it on change)
      so a stale file cannot be sent for a method that does not want it.
    - Each tile is a single file, replaceable, not a strip: this is not the Update Status photo
      grid. Still reuse its mechanics — a `<label>` wrapping an `sr-only` file input rather than a
      button clicking a hidden one, `URL.createObjectURL` created only in the change handler (never
      in a state initialiser or an effect — `<StrictMode>` double-fires both) and revoked on
      replace and on unmount through a ref.
    - **The server requires neither photo** (`kit_photo`/`label_photo` are `required=False,
allow_null=True`). These are client rules, so they must be enforced client-side or they do not
      exist.
12. **Notes** — `Textarea`, label `Notes (optional)`, placeholder "Surgery details, special
    instructions...". Never required, whatever else is selected.
13. **Confirm Transfer** — full-width primary button; spinner + non-interactive while saving, same
    pending treatment as `src/features/auth/login-form.tsx`.

Open state seeds entirely from the loaded kit; closing discards without confirmation. Mount the
dialog only while open — `kit-actions.tsx` already does this for Update Status, and it is what keeps
the edit session and the component lifetime the same thing.

Use plain `useState` plus a pure module for the form logic. `react-hook-form` is a dependency but
nothing in `src/features/` uses it, including the dialog that shipped; one form library appearing
for one screen is worse than none.

## Saving

Validate first, inline under the offending field (the app has **no toast system; do not add one**):
From selected, To selected, Reason selected, Transfer Date set, Transport Method selected, kit photo
staged, and label photo staged when the method is FedEx/UPS. Mobile's messages, reused verbatim:
"Please select where to transfer to", "Please select a transport method", "A kit photo is required",
"A shipping label photo is required".

Then **one request** — `POST /api/v1/inventory-transfers/`, operationId `create_inventory_transfer`,
as `multipart/form-data`:

| field                                                       | value                                                                |
| ----------------------------------------------------------- | -------------------------------------------------------------------- |
| `stock_items`                                               | `[kit.id]` — repeated field, see the trap below                      |
| `reason`                                                    | `ReasonEnum` wire value                                              |
| `transport_method`                                          | `TransportMethodEnum` wire value                                     |
| `transfer_date`                                             | `YYYY-MM-DD`                                                         |
| `from_assigned_to_{parent_company,representative,facility}` | exactly one, from the From picker                                    |
| `to_assigned_to_{parent_company,representative,facility}`   | exactly one, from the To picker                                      |
| `notes`                                                     | trimmed; **omit when empty** (there is nothing to clear on a create) |
| `kit_photo`                                                 | the file                                                             |
| `label_photo`                                               | the file, **only** when the method requires it                       |

- **Send `stock_items`, never `inventory_kits`.** Mobile still sends `inventory_kits`; the schema
  marks it `DEPRECATED — use stock_items`, both write the same source, and sending both with
  different values is a 400. Do not copy mobile here.
- **Never send `is_draft`.** It is writable on this serializer and defaults correctly; a draft
  transfer is hidden from admin views and is not what this dialog makes.
- **Verify the array actually serialises as repeated bare `stock_items` fields.** This is the same
  class of silent failure as `paramsSerializer: { indexes: null }` in `CLAUDE.md`: if the generated
  multipart body emits `stock_items[0]`, Django's `getlist` sees nothing, the transfer is created
  with **no kits attached**, and it returns 201. Assert the request body in a test — an empty
  transfer looks like success from the UI.
- The endpoint accepts `application/json` when no files are attached. There is always a kit photo, so
  this path never applies; do not build it.

**On 201**: close the dialog and invalidate `stockItemKeys.all`
(`src/features/inventory/inventory.keys.ts`). That one prefix covers the detail query (the kit now
has `active_transfer_id`, so the In Transit banner appears and every action card disables), the
history feed (which narrates "Transfer initiated") and the on-hand list.

**There is no partial-failure state, and that is the point** — unlike Update Status, this is a single
atomic request, so there is no latch to build, nothing to re-send selectively, and a failure leaves
the kit exactly as it was. Keep it that way.

**Errors** are a bare `{field: ["msg", …]}` map plus `non_field_errors`, explicitly documented on
this operation's 400 — not the `{code, detail, field_errors}` contract, which is `/api/v1/web/*`
only. Use `asFieldErrors` from `src/api/errors.ts`; the Update Status work put it there for exactly
these writes. Three server errors matter:

- **"These stock items are already in transit under another transfer: [ids]."** — keyed under
  `stock_items`. Reachable despite the card being disabled for in-transit kits: someone else can
  start a transfer while this dialog is open. Show it and keep the dialog open.
- **The required-stock error is reported under _both_ `stock_items` and `inventory_kits`**, by
  design, so a client on either spelling sees it. Map both names to the same slot or a real error
  renders as nothing.
- **`Invalid pk "…" - object does not exist.`** on a `*_assigned_to_*` field or on `stock_items` —
  the queryset is org-scoped, and "not yours" and "does not exist" are deliberately
  indistinguishable. Do not write copy that guesses which it was.

Trailing slashes on every path.

## Plumbing (read `orval.config.ts`'s header comment first)

- Add to `ALLOWED_OPERATIONS`: `create_inventory_transfer` and `list_inventory_transfer_targets`.
  Both are inside the backend's accuracy gate, so note that beside them the way the existing entries
  note their reasoning. Then `pnpm api:pull` (the targets endpoint is new, so the vendored schema
  **does** need refreshing this time), `pnpm api:gen`, and commit schema + client together.
- New shadcn primitive: `pnpm dlx shadcn@latest add calendar && pnpm format`. The format step is not
  optional.
- Wire the card: give the `transfer` action in `kit-actions.tsx` an `onClick`, mount the dialog only
  while open, and drop its `· to Warehouse only` annotation. Keep `disabled: inTransit`.
- Query the targets once per dialog open with TanStack Query; add a `transferKeys` factory to
  `inventory.keys.ts` rather than reaching for `stockItemKeys` — targets are a different resource
  with a different lifetime, which is the reasoning already recorded there for `trackerKeys`.
- New files in `src/features/inventory/components/` (kebab-case), e.g. `transfer-dialog.tsx`, with
  the pure logic — target expansion, payload builder, validation, photo requirements per method — in
  a plain module beside it so it unit-tests without rendering.

## Testing (Vitest + MSW; no new Playwright)

Patterns to copy: `__tests__/column-menu.test.tsx` for the jsdom stub block (Radix `Select` and
`Popover` both need `ResizeObserver`, pointer-capture and `scrollIntoView`), `kit-fixture.ts` for the
kit factory, per-test `server.use(...)` (`src/test/msw/server.ts` has **no** default handlers and
`onUnhandledRequest: 'error'`). Stub `URL.createObjectURL`/`revokeObjectURL`.

Cover at least:

- Target expansion: a `representative` value writes `to_assigned_to_representative` and leaves the
  other two columns absent; same for `facility`; the composite `type:id` key distinguishes a rep and
  a facility that share an id.
- From pre-fills from the kit's assignment, including the parent-company case, where the option is
  injected and still renders.
- Photo requirements per transport method: none before a method is chosen, kit-only for `rep`,
  kit + label for `fedex`/`ups`, and switching carrier → rep clears the staged label photo.
- Validation blocks the save with each field missing in turn, and the kit photo is required for
  every method.
- Payload shape: `stock_items` present as an array, `inventory_kits` absent, `is_draft` absent,
  `notes` omitted when blank, `label_photo` absent for `rep`, `transfer_date` as `YYYY-MM-DD`.
- **The multipart body serialises `stock_items` as a repeated field** — the silent-201 trap above.
- A 400 keyed `stock_items` renders; the dual-name required error renders once, not twice.
- Success closes the dialog and invalidates the stock-items prefix.
- `kit-actions.test.tsx` asserts exact button counts and that Transfer does nothing — it will need
  updating, the same way the Update Status work updated it.

Gate on **`pnpm verify`**. E2E is out of scope: nothing here touches httpOnly cookies, which is the
whole Playwright budget.

## Explicitly out of scope

Bulk/multi-kit transfer and the on-hand selection action bar · the Pending Transfer modal and
Confirm Receipt (`confirm_inventory_transfer_receipt`) · cancelling a transfer · Return to
Manufacturer · the prototype's rule that setting Physical Location to the transfer destination
auto-confirms arrival · transfer editing (`PATCH`/`PUT` on the transfer) · a transfers list screen ·
the `other` transport method · organizations as destinations · any toast/notification system.
