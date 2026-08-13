# Build the "Add Hansel Tracker" dialog on Kit Detail

Read `CLAUDE.md` first and follow it. This brief adds facts you cannot get from the code; where it
names an exact endpoint, field, or rule, treat it as authoritative.

The three sibling briefs in this directory describe the dialogs already merged. This one is much
smaller than any of them — one field, one request — and the main risk is over-building it.

## What this is

The Kit Detail screen renders an Actions column (`src/features/inventory/components/kit-actions.tsx`)
whose fourth and last card is a deliberate no-op. Build the dialog behind it: a modal that asks for a
**Beacon ID** and attaches that Hansel tracker to the kit.

**Rename the card from "Pair Hansel Tracker" to "Add Hansel Tracker."** Mobile's sheet has been
titled `Add Hansel Tracker` since it shipped, so this is the web catching up rather than a new name.
The card's description also needs rewriting: it currently reads "Scan a Hansel tracker to enable
real-time location", and nothing here scans anything — the user types an id. Something like "Enter a
beacon ID to enable real-time location".

Feature behaviour is specified by the **mobile app**:
`surgiscribe-mobile-app/lib/app/modules/inventory/views/add_tracker_sheet.dart`. There is no
prototype screen for this at all — GPS tracking appears in the prototypes only as the Live Location
card and the Last Seen column, never as an attach flow ([Spec conflicts](../../../surgiscribe-backend/docs/tickets/surgisync-web-inventory.md)
§1 records that tracking is in neither the FRD nor the SOW). So mobile is the only reference, and
appearance follows the dialogs already in this app.

## There is no backend work and no codegen

Attaching a beacon is **`PATCH /api/v1/stock-items/{id}/` with `{beacon_id}`** — the same operation
Update Status already writes. `api_v1_stock_items_partial_update` is in `ALLOWED_OPERATIONS`,
`beacon_id?: string` is already on the generated `PatchedInventoryKitDetailRequest`, and the 409 body
is already generated as `Conflict`. **Do not run `pnpm api:pull` or `pnpm api:gen`, and do not touch
`orval.config.ts`.**

Three things about the server side that shape the dialog (`tracking/services.py`, `attach_beacon`):

- **A blank `beacon_id` is a silent no-op.** The service strips the value and returns `None` without
  attaching anything — and the PATCH still succeeds with 200. So a dialog that lets an empty value
  through closes on a success that did nothing. **The required check is not decoration; it is the
  only thing standing between the user and that outcome.** Mobile guards it by disabling OK until the
  field is non-empty; do the same, and validate on submit as well.
- **Attaching a beacon that is already on this kit is idempotent**, and reactivates it if it had been
  deactivated. So a double submit is safe.
- **Everything else is a 409**, never a field error. Two codes, both documented on the operation:
  - `beacon_in_use` — the beacon is attached to a different kit.
  - `kit_has_tracker` — this kit already has one. Only reachable if a tracker was attached elsewhere
    while this dialog was open, since the card is hidden for a kit that has one.

## The dialog

Small. Use the vendored `Dialog` at something like `sm:max-w-md` — this is not the `sm:max-w-xl`
scrolling form the other three are, and it needs no `overflow-y-auto`.

1. **Header** — title "Add Hansel Tracker", the Dialog's built-in close.
2. **`KitSummary`** from `components/dialog-parts.tsx`, so the user can see which kit they are about
   to attach hardware to. (Mobile omits it because its sheet is pushed from a screen already showing
   the kit; on a modal over a wide desktop layout it earns its place.)
3. **Hansel Tracker \*** — a shadcn `Input`, label "Hansel Tracker", placeholder "Beacon ID",
   autofocused, and submitting on Enter. **No format validation**: the beacon vocabulary is not
   documented anywhere in the contract, mobile imposes none, and a client-side pattern invented here
   would reject ids the hardware actually issues. Trim before sending.
4. **Cancel and Add** — Cancel closes without saving; Add is disabled until the field is non-empty
   and shows the spinner treatment while in flight. Mobile labels it "OK"; prefer **"Add Tracker"**,
   which says what it does and matches the other three dialogs' verb-first buttons.

Mount only while open, as `kit-actions.tsx` already does for the other dialogs.

## Saving and errors

`PATCH /api/v1/stock-items/{id}/` with exactly `{ beacon_id: trimmed }` and nothing else. It is a
PATCH, so every other field is left alone by omission — **do not spread the kit into the body**, and
in particular do not send the status booleans the way Update Status does. This request has one field.

**On success**: invalidate `stockItemKeys.all` and close. That single prefix is what makes the screen
rearrange itself — the kit now has a `tracker`, so the action card disappears and the Live Location
panel takes its place.

**On 409**: stay open with the value intact, and show the message **under the field**, not in a
form-level alert — it is about the value they typed. Branch on the `error` code, never the message,
per `CLAUDE.md`. Mobile's copy, which is better than the server's and should be reused:

- `beacon_in_use` → "This tracker is already associated with a different item. Please detach from
  that first, or use a different tracker."
- `kit_has_tracker` → "This item already has a tracker attached."
- any other code → fall back to the server's own `message`, then to the house generic.

**Clear the error on the first edit**, so it never outlives the value that caused it.

Nothing in `src/api/errors.ts` reads a 409 today, so add the narrowing helper there beside
`asWebError` / `asFieldErrors` / `isNotFound` rather than in the feature — the `Conflict` shape
(`{error, message}`) is a documented API-wide contract, and it is a **third** error shape distinct
from both the `{code, detail}` web errors and the bare field maps. Guard it the way `asFieldErrors`
guards its own: check the status and the value types, so one shape cannot be mistaken for another.

## Plumbing

- No new shadcn primitives — `Dialog`, `Input`, `Label` and `Button` are all vendored.
- Wire the card: give the `pair` action in `kit-actions.tsx` an `onClick`, rename its title and
  description as above, and keep both `disabled: inTransit` and the `!kit.tracker` condition that
  decides whether it renders at all.
- New files: `src/features/inventory/add-tracker.ts` if there is enough pure logic to be worth it
  (the conflict-code → copy mapping is), and `components/add-tracker-dialog.tsx`.

## Testing (Vitest + MSW; no new Playwright)

Copy the patterns in the sibling dialog tests, including the Radix jsdom stub block.

- The Add button is disabled until the field has content, and a whitespace-only value does not submit
  — **the test that matters most**, because the server would accept it and do nothing.
- The PATCH body is exactly `{beacon_id}` with the value trimmed, and carries no other field.
- `beacon_in_use` and `kit_has_tracker` each render their own copy under the field, and the dialog
  stays open with the typed value intact.
- Editing after a conflict clears the error.
- Success invalidates the stock-items prefix and closes.
- `kit-actions.test.tsx` matches `/Pair Hansel Tracker/` in two places and asserts exact button
  counts; the rename breaks it, and it needs updating rather than loosening.

Gate on **`pnpm verify`**.

## Explicitly out of scope

Detaching a tracker — the Live Location panel's "Detach tracker" stays a no-op, and
`detach_inventory_kit_tracker` is deliberately still absent from the allowlist · scanning a beacon
from the browser · the tracker-reassignment conflict flow the prototypes hint at · attaching a
tracker during receive · any toast/notification system.
