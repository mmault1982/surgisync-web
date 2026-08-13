# Build the "Return to Manufacturer" dialog on Kit Detail

Read `CLAUDE.md` first and follow it. This brief adds facts you cannot get from the code; where it
names an exact endpoint, field, or rule, treat it as authoritative.

`docs/prompts/transfer-dialog.md` is the sibling brief, and its dialog is already merged. **This
screen is a variant of that one, not a new species** — reuse `src/features/inventory/transfer.ts`
and `components/dialog-parts.tsx` rather than forking them. Where the two differ, this brief says so
explicitly, because the differences are the part that a copy-paste would get wrong.

## What this is

The Kit Detail screen (`src/routes/_authenticated/inventory/on-hand_.$stockItemId.tsx`) renders an
Actions column (`src/features/inventory/components/kit-actions.tsx`) whose **Return to Manufacturer**
card is a deliberate no-op. Build the dialog behind it: a modal that sends **one** kit back to its
manufacturer, recording why and in what condition.

Feature behaviour is specified by the **mobile app** (already shipped):
`surgiscribe-mobile-app/lib/app/modules/inventory/controllers/return_to_manufacturer_controller.dart`
and `views/return_to_manufacturer_sheet.dart`. The desktop mockup — `mReturn()` in
`SurgiSync Inventory WebAdmin.html` — informs **appearance only**.

Two decisions were made before this brief and are not open:

1. **A reason is always required**, whatever the kit's ownership. The prototype exempts loaned kits
   with an info banner ("Loaner returns do not require a reason"); mobile requires one for every
   return, and this follows mobile as Update Status and Transfer both did. `ownership_type` is not
   consulted.
2. **Kit Condition is captured as text only.** Mobile folds it into the transfer's notes and never
   writes the kit's own `is_complete`, so a kit returned as incomplete still reads as complete in the
   on-hand list. That is a real limitation — record it in the code comment, do not fix it here.
   Fixing it means a PATCH before the POST, which reintroduces the ordering and partial-failure latch
   that Update Status needed and Transfer deliberately does not have.

## There is no backend work, and the ticket is wrong about that

**A return is not its own resource. It is a transfer with `reason: 'return'` and no in-system
destination.** The backend's own test for one is `_is_return_to_manufacturer`
(`inventory/views_inventory_transfer.py:357-364`): `reason == RETURN` **and**
`to_assigned_to_facility_id is None` **and** `to_assigned_to_representative_id is None`. Note what is
_not_ in that list — `to_assigned_to_parent_company` may be set, and mobile does set it.

So this screen needs **no new endpoint, no `pnpm api:pull`, and no allowlist change**:
`create_inventory_transfer` is already generated and already inside the response-accuracy gate.

> The backend ticket (`../surgiscribe-backend/docs/tickets/surgisync-web-inventory.md`) lists Return
> to Manufacturer under **Deferred**, as something that "needs backend that does not exist yet" and
> is not required for mobile parity, and again under **Phase 4+** as "gated on new backend". **Both
> are wrong**: mobile ships this screen today, and the contract has supported it since before Phase 0. Flag it so the ticket gets corrected — do not treat the deferral as a reason to stop.

**What this dialog does _not_ do is finish the return.** The kits only leave inventory when someone
calls `confirm_inventory_transfer_receipt`, which soft-deletes both the kits and the transfer
(`views_inventory_transfer.py:390-398`). The web app has no Confirm Receipt yet, so a returned kit
sits in transit from this app's point of view — exactly the gap the Transfer dialog already ships
with, and the reason both halves of Phase 3 are still open.

## Dialog contents, top to bottom

Reuse the `Dialog` shell, sizing and scroll behaviour from `transfer-dialog.tsx`, and the shared
`Field` / `KitSummary` / `ExpiredBanner` from `components/dialog-parts.tsx`. Everything below is
already a vendored shadcn primitive except one.

1. **Header** — title "Return to Manufacturer", the Dialog's built-in close.
2. **`KitSummary`** — unchanged.
3. **Destination line** — "Sending back to **{kit.manufacturer_name}**". There is no picker: the
   manufacturer is a property of the kit, and this is the whole point of the screen. Render it as
   read-only text, not a disabled control.
4. **`ExpiredBanner`** — with a `detail` line suited to this dialog: returning is the _recommended_
   action for an expired kit, not a blocked one. (The action card already annotates itself
   `· recommended` for expired kits — keep that.)
5. **Reason \*** — a shadcn `Input`, placeholder "e.g., Damaged, Expired, Overstocked" (mobile's,
   which the prototype matches). Free text, required, trimmed.
   **This is not the `reason` field on the wire.** That one is the `ReasonEnum` and is always
   `return`. This input is prose that ends up inside `notes`. Naming the state `returnReason` rather
   than `reason` is worth the extra characters.
6. **Kit Condition \*** — a two-option pole pair, Complete / Incomplete, seeded from
   `kit.is_complete ?? true`. Exactly one is always selected; there is no unset state.
   Use shadcn's `ToggleGroup` (`pnpm dlx shadcn@latest add toggle-group && pnpm format`) with
   `type="single"`, and **guard the deselect**: Radix emits `''` when the pressed item is clicked
   again, which must be ignored rather than stored, or the field silently loses its value. Style the
   selected item to match the Update Status selected chip (`success-container` fill, `success`
   border) so the same semantic control does not look like two different things across two dialogs.
   Incomplete keeps the warning-tinted icon it has in both mobile and the prototype.
7. **Transport Method \*** — `Select`, placeholder "Select how it's being shipped..." (mobile's
   wording here, _not_ Transfer's "being transported"). Reuse `TRANSPORT_OPTIONS` from `transfer.ts`
   — the same three, `other` still not surfaced.
8. **Required Photos \*** — **both, always.** Kit Photo ("Before boxing") and Shipping Label ("For
   tracking"), side by side.
   **This is the divergence most likely to be got wrong by reuse.** Transfer asks for the label only
   for FedEx/UPS, via `requiresLabelPhoto`. A return always ships to the manufacturer, so mobile
   requires both for every method including Rep Transport — `requiresLabelPhoto` **must not** be
   consulted here. Reuse the `StagedFile` / `replaceFile` helpers (already exported from
   `transfer.ts`) and the tile component — but note `PhotoCapture` is currently _local_ to
   `transfer-dialog.tsx`, so **lift it into `dialog-parts.tsx`** beside `Field` and `KitSummary`
   rather than exporting one dialog's internals into another. What you must not lift is the
   per-method rule that decides how many tiles to render.
9. **Notes** — `Textarea`, label `Notes (optional)`, placeholder "Any additional details...".

Open state seeds entirely from the kit; closing discards without confirmation. Mount the dialog only
while open, as `kit-actions.tsx` already does for the other two.

**The in-transit case needs no UI.** The prototype opens the modal and shows a "Return blocked — kit
is in transit … Review Pending Transfer" panel instead of the form. The action card is already
`disabled` while `kit.active_transfer_id !== null`, so that state is unreachable — keep the disabled
card rather than building a dialog whose only job is to say no. Revisit when Pending Transfer exists
and there is somewhere for its button to go.

## Saving

Validate first, inline under the offending field (no toast system; do not add one). Mobile's
messages, verbatim:

- "Please enter a reason for the return"
- "Please select a transport method"
- "A kit photo is required"
- "A shipping label photo is required"

Then **one request** — `POST /api/v1/inventory-transfers/`, `create_inventory_transfer`, multipart:

| field                           | value                                                                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| `stock_items`                   | `[kit.id]` — repeated field, as Transfer already sends                                              |
| `reason`                        | `'return'` — the enum, always                                                                       |
| `transport_method`              | the chosen method                                                                                   |
| `transfer_date`                 | today, `YYYY-MM-DD` via `toDateInput` (mobile uses `now()`; there is no date picker on this screen) |
| `from_assigned_to_*`            | the kit's current holder, expanded exactly as Transfer does                                         |
| `to_assigned_to_parent_company` | `kit.parent_company`, **omitted entirely when it is null**                                          |
| `notes`                         | the composed string below                                                                           |
| `kit_photo`, `label_photo`      | both files                                                                                          |

- **Never send `to_assigned_to_representative` or `to_assigned_to_facility`.** Those two being null
  is precisely what makes this a return rather than an ordinary transfer; setting either turns it
  into a normal move and the kits will land with a new holder instead of leaving inventory.
- **`notes` is composed, and the format is mobile's** — an auditor reads these across both clients,
  so it has to match: `Return reason: {reason} · Condition: {Complete|Incomplete}`, then, only when
  the user typed extra notes, a blank line and that text. Build it in a pure function.
- Everything else about the request — the repeated-field encoding, `inventory_kits` never being
  sent, `is_draft` never being sent — is already true of `buildTransferBody`; share the code rather
  than restating it.

**On 201**: invalidate `stockItemKeys.all` and close, exactly as Transfer does. The kit now has an
`active_transfer_id`, so the In Transit banner appears and every action card disables.

**Errors** are the same bare `{field: ["msg"]}` map; reuse `transferFieldErrors` and
`transferErrorMessage`, extending the slot map if a field has no home in this form. There is no
partial-failure state and no latch — one atomic request, and a failure leaves the kit untouched.

## Plumbing

- **No `pnpm api:pull`, no `pnpm api:gen`, no `ALLOWED_OPERATIONS` change.** If you find yourself
  editing `orval.config.ts`, stop and re-read the contract section above.
- One new shadcn primitive: `toggle-group` (which pulls `toggle`). Run `pnpm format` after — not
  optional.
- Wire the card: give the `return` action in `kit-actions.tsx` an `onClick`, mount the dialog while
  open, keep `disabled: inTransit` and keep the expired `· recommended` annotation and highlight.
- New files in `src/features/inventory/`: `return-to-manufacturer.ts` for the pure logic (notes
  composition, validation, payload) and `components/return-to-manufacturer-dialog.tsx`. Put anything
  genuinely shared with Transfer into `transfer.ts` rather than duplicating it — the column-expansion
  helper in particular.

## Testing (Vitest + MSW; no new Playwright)

Copy the patterns in `__tests__/transfer.test.ts` and `__tests__/transfer-dialog.test.tsx`,
including the jsdom stub block and — for anything asserted on the request — **reading the raw
multipart body rather than `request.formData()`**, which is unusable on a body jsdom's XHR produced.

Cover at least:

- The notes composition, including the two-paragraph form when extra notes are present and the
  single-line form when they are not.
- `reason` on the wire is the enum `return`, and the user's free text never appears in that field.
- `to_assigned_to_parent_company` is sent when the kit has one and **absent** when it does not, and
  neither `to_assigned_to_representative` nor `to_assigned_to_facility` is ever sent.
- **Both photos are required for every transport method**, Rep Transport included — the test that
  would have caught a copy of Transfer's carrier-only rule.
- Condition seeds from `kit.is_complete`, and clicking the selected pole again leaves it selected
  rather than clearing the field.
- Validation blocks the save with each field missing in turn, and nothing is posted.
- Success invalidates the stock-items prefix and closes.
- `kit-actions.test.tsx` asserts that Return does nothing; it will need updating, as it did for
  Transfer.

Gate on **`pnpm verify`**.

## Explicitly out of scope

Multi-kit / group returns and mobile's manufacturer-anchoring rules · Confirm Receipt, which is what
actually removes the kits from inventory · cancelling a return · UPS/FedEx label generation, which
the prototype's success toast promises and which is deferred in the ticket · writing `is_complete`
back to the kit · the prototype's in-transit "Review Pending Transfer" panel · loaner fee accrual ·
any toast/notification system.
