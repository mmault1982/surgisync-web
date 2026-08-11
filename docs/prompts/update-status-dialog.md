# Build the "Update Status" dialog on Kit Detail

Read `CLAUDE.md` first and follow it. This brief adds facts you cannot get from the code; where it
names an exact endpoint, field, or rule, treat it as authoritative.

## What this is

The Kit Detail screen (`src/routes/_authenticated/inventory/on-hand_.$stockItemId.tsx`) renders an
Actions column (`src/features/inventory/components/kit-actions.tsx`) whose **Update Status** card is
a deliberate no-op. Build the dialog behind it: a modal that shows summary details for the kit and
lets the user change its status flags, physical location, photos, and notes, then saves.

Feature behaviour is specified by the **mobile app** (already shipped); the desktop mockup only
informs appearance. Where this brief spells out behaviour, it is the mobile behaviour — do not
reintroduce rules from the prototype HTML (it has extra rules — chip disabling, "Lost clears all" —
that were **explicitly decided against**).

## The data model (why the chips work the way they do)

Status is **six independent booleans** on the stock item: `is_complete`, `is_wrapped`,
`is_signed_in`, `is_returned`, `is_lost`, `is_other`. There is no `is_incomplete`, `is_unwrapped`,
or `is_signed_out` — those are the _false_ side of the first three. The dialog renders eight chips,
but they are views onto the six booleans:

- **Complete / Incomplete** — poles of `is_complete`. Clicking Complete sets it true; clicking
  Incomplete sets it false. Exactly one of the pair is always selected. Same for
  **Wrapped / Unwrapped** (`is_wrapped`) and **Signed In / Signed Out** (`is_signed_in`).
- **Lost** (`is_lost`) and **Other** (`is_other`) — independent toggles.
- **`is_returned` has no chip.** Echo the kit's current value back in the PATCH unchanged —
  omitting it is fine (PATCH), but never send a hardcoded value, or you'll silently clear it.
- **Nothing is ever disabled**, and no chip clears any other. The expired/sterile-packed rules in
  the prototype HTML do not exist in this product.

## Dialog contents, top to bottom

Use the vendored shadcn `Dialog` (`src/components/ui/dialog.tsx`). Its default `sm:max-w-sm` is too
narrow — override to roughly `sm:max-w-xl`, and give the body `max-h` + `overflow-y-auto` so long
content scrolls inside the dialog. Match the app's tokens (`CLAUDE.md` → Tokens); no raw hex.

1. **Header** — title "Update Status", close X (the Dialog's built-in close).
2. **Summary card** (muted panel): `part_name`, `manufacturer_kit_id` in mono (`—` when null), and
   an ownership pill — reuse `ownershipLabel` from `src/features/inventory/kit-detail.ts`.
3. **Expired banner — display only.** When `isExpired(kit)` (`src/features/inventory/stock-status.ts`),
   show a destructive-tinted banner: bold "Expired — kit cannot be used", body
   "Exp: {expiration_date}. Mark condition for return audit, then Return to Manufacturer." It
   restricts nothing; it is informational.
4. **Status** — label `Status *` with muted "(select all that apply)". A 4×2 grid of chip buttons:
   - Row 1: Complete (check), Wrapped (package), Signed In (arrow right), Lost (question mark)
   - Row 2: Incomplete (warning triangle, `text-warning`), Unwrapped (open package),
     Signed Out (arrow left), Other (file/document)
     Lucide icons are fine. Selected chip: `success-container` background, `success` border, small
     check badge top-right (see the mockup screenshot / prototype `.stb-btn.sel`). Unselected:
     `border` + `card`. Chips are `<button type="button" aria-pressed={selected}>`.
     Below the grid, the legend bullets (muted, small — exactly these five, from mobile):
   - `Complete - All items present and accounted for`
   - `Wrapped - Sterile-wrapped and ready`
   - `Signed In - Signed-in to SPD`
   - `Lost - Cannot be located`
   - `Other - See notes`
5. **Physical Location** — label `Physical Location *`. A shadcn `Select` whose options come from
   the **already-generated** facet hook for `list_stock_item_physical_location_facets`
   (`GET /api/v1/stock-items/physical-locations/` → `{results: string[]}`, distinct values in use
   in the org). Decision on record: **facets only, no free-text entry**. If the kit's current
   `physical_location` is non-empty, preselect it (append it to the options if the facet list
   somehow lacks it, so it can't silently vanish). Required to save.
6. **Photos** — label `Photos *` with a muted `(n of 10)` count. A wrap of ~96px square tiles:
   - Existing photos from `kit.photos` (oldest first — the server orders them; render `url`, which
     is nullable → placeholder tile when null). Badge the **first tile** with a "Primary" caption
     bar. Primary is _positional_ — the server treats the oldest photo as primary; there is no
     set-primary API, so no set-primary UI.
   - Each tile has a remove X. Removals of server photos are **staged** (collected for deletion at
     save time), not immediate. New photos come from a trailing dashed **Add** tile → hidden
     `<input type="file" accept="image/*">`; preview via `URL.createObjectURL` (revoke on cleanup —
     StrictMode is on, effects double-fire in dev).
   - Rules (client-side; the server enforces neither): at least **1** photo must survive the save
     ("A kit must have at least one photo"), at most **10** total ("You can attach up to 10
     photos"). Count = surviving existing + staged additions.
7. **Notes** — shadcn `Textarea`, placeholder "Any additional details...". Label swaps between
   `Notes (optional)` and `Notes *`: **required when Lost or Other is selected** ("Notes are
   required when Lost or Other is selected").
8. **Save Status** — full-width primary button; spinner + non-interactive while saving (copy the
   pending treatment in `src/features/auth/login-form.tsx`).

Open state: the dialog is **fully seeded from the loaded kit** — booleans, location, notes text,
photo strip. Closing (X / overlay) discards staged changes without confirmation, matching mobile.

## Saving

Validation first (inline red text under the offending field — the app has **no toast system; do
not add one**): location selected; notes non-blank when Lost/Other; photo count within 1–10.

Then, in this order (the ordering is mobile's, and it is deliberate):

1. **PATCH `/api/v1/stock-items/{id}/`** — operationId `api_v1_stock_items_partial_update`, JSON
   body with all six booleans (`is_returned` echoed from the kit), `physical_location`, and
   `notes: trimmed || null`. (Sending explicit `null` clears notes; mobile omits empty notes and
   therefore can't clear them — that's a mobile bug, not a feature. Do not copy it.)
   **Never include the `photo` field** — writing it replaces the primary photo's image in place.
   Latch success: if photo steps fail and the user retries, **do not PATCH again** — each PATCH
   writes kit-history entries ("Marked complete", "Moved to X"…) and a duplicate PATCH duplicates
   them.
2. **Photo uploads, then deletions, sequentially** — uploads first so the kit's photo count never
   passes through zero; sequential (not `Promise.all`) because every request shares the same
   100/min per-user throttle. Upload: `POST /api/v1/stock-items/{id}/photos/`
   (`create_inventory_kit_photo`) — **multipart only**, field `image`, one file per request.
   Delete: `DELETE /api/v1/stock-items/{id}/photos/{photo_id}/` (`delete_inventory_kit_photo`), 204.
3. **On full success**: close the dialog and invalidate the `stockItemKeys.all` prefix
   (`src/features/inventory/inventory.keys.ts`) — that one prefix covers the detail query, the
   history feed (which will now narrate the change), and the on-hand list.
4. **On partial photo failure**: stay open, mark the failed tiles, and let Save retry **only** the
   outstanding photo operations (the PATCH latch from step 1 protects the status write).

Error shapes: this PATCH's 400 is a **bare `{field: ["msg", …]}` map** — not the
`{code, detail, field_errors}` contract in `src/api/errors.ts`, which only applies to
`/api/v1/web/*`. `errorMessage()` will fall through to its generic string; map field errors to the
matching inputs where practical and show the generic message otherwise. Remember trailing slashes
on every path.

## Plumbing (read `orval.config.ts`'s header comment first)

- Add to `ALLOWED_OPERATIONS`: `api_v1_stock_items_partial_update`, `create_inventory_kit_photo`,
  `delete_inventory_kit_photo`. Then `pnpm api:gen` and **commit the regenerated client** —
  `pnpm api:check` diffs against a fresh generation. Do not run `pnpm api:pull`; the vendored
  schema is current. All three operations are inside the backend's schema-accuracy gate, so the
  generated client is trustworthy.
- New shadcn primitives: `pnpm dlx shadcn@latest add select textarea && pnpm format` (the format
  step is mandatory — see CLAUDE.md).
- Wire the card: in `kit-actions.tsx`, give the `status` action an `onClick` (the other actions
  stay no-ops). The card is already disabled while the kit is in transit — keep that; it means the
  prototype's in-transit save-button variants are out of scope.
- New components live in `src/features/inventory/components/` (kebab-case files), e.g.
  `update-status-dialog.tsx`, with pure logic (chip-state reducer, payload builder, photo staging)
  in a plain module beside it so it unit-tests without rendering.

## Testing (Vitest + MSW; no new Playwright)

Patterns to copy: `src/features/inventory/__tests__/column-menu.test.tsx` (jsdom stubs — Radix
`Select` needs the same `ResizeObserver`/pointer-capture/`scrollIntoView` block),
`kit-fixture.ts` (kit factory), per-test MSW handlers via `server.use(...)`
(`src/test/msw/server.ts` has **no** default handlers and `onUnhandledRequest: 'error'`). Stub
`URL.createObjectURL`/`revokeObjectURL` — jsdom lacks them.

Cover at least:

- Pole-pair semantics: clicking Incomplete lights it and unlights Complete (one boolean, two
  faces); Lost/Other toggle independently; nothing disables anything.
- Notes required iff Lost or Other; location required; photo min-1/max-10 enforcement.
- PATCH payload shape: all six booleans present with `is_returned` echoed from the fixture, `photo`
  absent, `notes` null when cleared.
- Ordering: PATCH → uploads → deletions; on a failed upload, retry re-sends only the failed photo
  op and does **not** re-PATCH.
- Success closes the dialog and invalidates the stock-items query prefix.
- `kit-actions.test.tsx` will need updating — it currently asserts exact button counts and that
  Update Status does nothing.

Gate on **`pnpm verify`**. E2E is out of scope: nothing here touches httpOnly cookies, which is
the whole Playwright budget.

## Explicitly out of scope

Bulk status updates; transfer confirm/cancel-on-location-change (in-transit kits can't open the
dialog); photo captions; a set-primary control (primary is positional); server-side validation
changes; any toast/notification system.
