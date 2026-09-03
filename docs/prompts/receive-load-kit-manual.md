# Build the "Receive / Load" screen — Kit + Manual

Read `CLAUDE.md` first and follow it. This brief adds facts you cannot get from the code; where it
names an exact endpoint, field, or rule, treat it as authoritative.

The four sibling briefs in this directory describe the dialogs already merged. This is the first
**screen** rather than a dialog, but the parts it shares with them — `Field`, the photo strip, the
error shapes, the two-phase save, the test patterns — are already written. Copy them rather than
inventing a second way.

## What this is

`src/routes/_authenticated/inventory/receive.tsx` renders `<ComingSoon>`. Replace it with the real
screen: the form that puts a kit into inventory in the first place. It is the last piece of mobile
parity in the ticket's Phase 2 — until it exists, a kit can only enter this system through the
Flutter app.

The screen is a **single form card** with two exclusive pairs of mode buttons at the top:

|         | **Manual** | **Bulk Upload** |
| ------- | ---------- | --------------- |
| **Kit** | build this | placeholder     |
| **SKU** | next brief | placeholder     |

**Only Kit + Manual is in scope.** The other three combinations render a short "coming soon" panel
inside the same card — exactly what mobile does (`_buildPlaceholder`,
`load_inventory_screen.dart:94-96`). Do not disable the buttons: the four modes are the shipped
information architecture on both mobile and the prototype, and a disabled control tells the user
less than an honest placeholder does.

Feature behaviour is specified by the **mobile app** (already shipped):
`surgiscribe-mobile-app/lib/app/modules/inventory/controllers/load_inventory_controller.dart` and
`views/load_inventory_screen.dart`. The desktop mockup — `renderReceive()` / `receiveKit()` in
`SurgiSoft/SurgiSync Inventory WebAdmin.html` — informs **appearance only**. Where the two disagree,
mobile wins and this brief says so.

Three decisions were made before this brief and are not open:

1. **No scanning.** The prototype puts a `⊞ Scan` button beside Kit ID and a pair-by-scan widget on
   the tracker field; mobile has a camera. A browser has neither, and a button that opens nothing is
   how dead controls get copied into every later screen. Kit ID and Beacon ID are typed.
2. **No Lot # and no Serial #.** The prototype's kit form has both. Mobile's does not — they live on
   its SKU form — and there is no `serial` field anywhere in the contract for the second one to
   write to (only `udi`, which is a different thing). Mobile is the functional spec: omit both.
3. **The Kit Name picker needs a new backend endpoint**, which does not exist yet. See below.

## Blocking prerequisite: a catalog endpoint

**Do not start the form until this has landed in `surgiscribe-backend`.** Of the five required
fields, Kit Name still has no source this client can generate:

- **`POST /api/v1/manufacturers/kits/`** (`get_manufacturer_kits_by_ids`) declares **no response
  content at all** (`responses={200: OpenApiResponse(description=...)}`, `manufacturers.py`). orval
  generates a call that returns `void`. What it actually returns is `{message, data}`, where each
  `data` entry is a manufacturer with a nested `kits` array of
  `{kit_id, kit_uuid, kit_name, number_of_items}`.
- The existing facets do not substitute: `list_inventory_kit_manufacturer_kit_ids` returns
  `manufacturer_kit_id` strings — the ids stamped on physical units — not catalog kit names.

Specify and land this first:

```
GET /api/v1/parts/?manufacturer_id=<int>&kind=<kit|component>&search=<str>
operationId: list_parts
→ PaginatedPartList   (the CustomPagination envelope, rows under `results`)
```

- **`/api/v1/parts/` is the resource, and the new prefix joins the gate in the same commit.** An
  earlier draft of this brief put the endpoint at `/api/v1/stock-items/catalog-kits/`, arguing that
  the prefix was already in `VALIDATED_PATH_PREFIXES` and so gated from day one. That was wrong, and
  the correction is worth keeping: the gate is only _hard to switch on_ where legacy undocumented
  operations already squat on a prefix — which is `/api/v1/manufacturers/`'s problem, not this
  one's. `/api/v1/parts/` does not exist yet, so a new prefix holding one fully-documented endpoint
  passes trivially and joins the tuple in the same commit. `/api/v1/web/` is the precedent, carrying
  the note "written contract-first, so it is enforced from its first commit rather than being
  brought up to standard later". **Add the prefix; do not hide the endpoint under `/stock-items/`,
  which is a resource it is not part of.**
- **`kind` takes `kit` or `component`** — `Part.Kind` is `KIT = 'kit'` / `COMPONENT = 'component'`
  (`inventory/models/part.py:63-65`). **Not `item`**, even though the sibling `source_kind` column
  does use `'item'`; they are different fields in the same table and the mix-up returns an empty
  list rather than an error.
- **`manufacturer_id` is repeatable**, read with `getlist`, matching the on-hand list's filters —
  and the reason `paramsSerializer: { indexes: null }` in `src/api/axios-instance.ts` is
  load-bearing. This screen sends one at a time; mobile's equivalent call passes a list, because
  case-building needs several at once. Optional: a bare call is the whole visible catalog, which
  pagination makes safe.
- **Always paginated**, exactly as `/manufacturers/` now is. Not a facet shape: components run to
  thousands where manufacturers run to twelve, so this one needs real paging — and one envelope
  across both pickers means this screen reads `results` the same way for each.
- **Contents**: sorted by name, scoped the way `get_manufacturer_kits` already scopes its POST body
  (`manufacturers.py`) — rows whose `parent_company` is in the requesting user's orgs **or is null**
  (null being the shared catalog), and `is_user_created=False`.
- **Response item**: a small Part representation — `id`, `uuid`, `name`, `kind`, `manufacturer`,
  `manufacturer_name`. `KitSerializer` (`inventory/serializers.py:123`) is already
  `['id','uuid','name','manufacturer']` and is the thing to model on. The SKU brief will likely want
  `reference_number` and `is_serialized`; adding a field later is backward-compatible, unlike
  changing the shape, so do not try to guess them now.

**One trap for whoever builds it.** `CatalogPagination` currently lives in
`inventory/views/manufacturers.py` and emits a deprecated `data` alias beside `results` — that alias
exists solely for shipped Flutter builds reading `/manufacturers/`. Reusing the class as-is would
give `/parts/` a deprecated key it never needed and no client ever read. Move the page-size half to
`hoosier/pagination.py` beside `CustomPagination`; leave the `data` alias as a manufacturers-only
subclass.

**This endpoint returns `uuid`, but this screen still sends the pk.** The catalog merge changes kit
pks in its phase 3 and the backend tells clients to key selections on the uuid for that reason —
which this client cannot do: `part` is declared `type: integer` in `InventoryKitDetailRequest`, so a
generated client cannot send the uuid its description says it accepts. The pk is safe **here
specifically** because it never outlives the session — the option list is fetched and submitted in
one sitting, which is the same argument `selectedKitId`'s doc comment makes in
`load_inventory_controller.dart:117-122`. The follow-up is on the schema, not on this screen: type
`part` as accepting either, then send the uuid this endpoint already returns.

### Manufacturer is no longer blocked

`/api/v1/manufacturers/` (`list_manufacturers`) used to be the other half of this section: it
answered `{message, total_data, data}` normally and a pagination envelope when `page` was passed —
two shapes one schema cannot describe. **That is fixed** (backend `feefae3`). It now always returns
the `CustomPagination` envelope, generating as `PaginatedManufacturerList`, so the Manufacturer
picker reads it directly and no `catalog-manufacturers` endpoint is needed.

Two things about it that must not be lost:

- **`data` is still in the response, as a deprecated exact duplicate of `results`.** It exists only
  until the shipped Flutter app's own fix reaches the field. **Read `results`.** The generated model
  will offer both; picking `data` builds a screen on a key with a removal date.
- **This is the org's _global_ catalog, unlike everything else this app reads.** It is scoped by
  `is_user_created=False`, not by organization, while `list_parts` above **is** org-scoped.
  So a user can legitimately pick a manufacturer whose kit list then comes back empty. The Kit Name
  empty state below is not defensive coding — that is the case it exists for. Pass `?has_items=true`
  to narrow it, and note that even so an empty kit list stays reachable, since a manufacturer can
  have active items without having kits.

**And it is outside `VALIDATED_PATH_PREFIXES`**, so its response accuracy is not enforced on every
backend test run the way `/stock-items/` is — the same position `/api/v1/trackers/` is in. Gating
that prefix means first documenting the two `manufacturers/kits/` operations that share it, which is
tracked as backend follow-up. Comment the allowlist entry accordingly.

## What is _not_ blocked

Everything else this screen needs already exists, and two of these are already wired for other
screens. Do not add backend work for any of them.

- **Rep / Assigned To** — `list_inventory_transfer_targets`, already in `ALLOWED_OPERATIONS` and
  already fetched by the Transfer dialog under `transferKeys.targets()`. Filter to
  `type === 'representative'`; the endpoint's own description says that block is "the
  representatives in the requesting user's organization", which is precisely what mobile fetches
  from `/api/v1/representatives/` and cannot be reached from here (that one is tagged `Users`,
  outside orval's tag filter, and widening the filter to reach one operation is not worth it when a
  gated endpoint already in the client answers the same question).
- **Physical Location** — `list_stock_item_physical_location_facets`, already in
  `ALLOWED_OPERATIONS` and already consumed by the Update Status dialog through
  `facetQueries.physicalLocations()`.
- **Creating the kit** — `create_inventory_kit`, `POST /api/v1/stock-items/`. Inside the accuracy
  gate. Add its operationId to `ALLOWED_OPERATIONS`; that is the only entry the write path needs.
- **The photos** — `create_inventory_kit_photo`, already in `ALLOWED_OPERATIONS` and already used by
  `update-status.save.ts`.

**Do not send `photo` on the create.** It is on the request schema, and mobile does send it, and
doing the same here would silently upload nothing. `create_inventory_kit` declares
`application/json` **first** among its three request content types, because
`InventoryKitViewSet` never sets `parser_classes` (only its photos action does,
`views_inventory_kit.py:920`) and DRF's default order is `[JSON, Form, MultiPart]`. A generated
client takes the first content type declared — this is the trap the backend ticket documents against
`create_inventory_transfer` in Phase 3 — so the generated call posts JSON and any `File` in the body
vanishes. Post the kit as JSON with no photo, then upload every photo through the photos
sub-resource, which is multipart-first and already generated correctly. That is not a workaround:
`perform_create` inserts the kit and then attaches the photo as a child row anyway
(`views_inventory_kit.py:443-458`), and `sync_inventory_kit_primary_photo` (`inventory/signals.py:54`)
mirrors the first photo row onto the kit's `photo` column. The end state is identical, so no backend
change is needed here.

## The screen, top to bottom

`max-w-[880px]`, matching the prototype's `.form-card`. Use the vendored `Card`; the page heading is
"Receive / Load Inventory" (the prototype's `.page-title`) and the breadcrumb already reads
"Inventory › Receive / Load" from `nav-config.ts`, which needs no change.

### 1. The four mode buttons

A 2×2 grid — Kit / SKU on the first row, Manual / Bulk Upload on the second — each a bordered card
with a bold title and a small subtitle, the selected one taking the brand border and tint. Copy is
the prototype's, which mobile matches word for word:

| button      | subtitle                |
| ----------- | ----------------------- |
| Kit         | Load full kits          |
| SKU         | Load individual items   |
| Manual      | Add items one at a time |
| Bulk Upload | Add items from a file   |

**Two `RadioGroup`s, not `ToggleGroup` and not buttons.** They are two independent exclusive
choices, which is what a radio group _is_: it brings arrow-key navigation, a group label, and
`role="radio"` with `aria-checked` for free, so the tests select by
`getByRole('radio', { name: /Kit/ })` rather than by class. `ToggleGroup` is built for compact
icon toolbars and its items have no room for a subtitle line. Style the `RadioGroupItem` as the
card by hiding the indicator and driving the border off `data-state`.

Keep both selections in component state. **Not in the URL** — on-hand puts its filters in search
params because a filtered list is worth linking to, whereas half a data-entry form is not, and none
of the fields below would be in the URL anyway.

Default to **Kit + Manual**, as mobile does.

### 2. The Kit + Manual form

Two columns on desktop (`grid-cols-2`, the prototype's `.form-grid`), the last three spanning both.
Every label uses `Field` from `components/dialog-parts.tsx`, so the required marker, hint and error
slot look the same as they do in the dialogs.

| #   | field             | control                 | required | notes                                              |
| --- | ----------------- | ----------------------- | -------- | -------------------------------------------------- |
| 1   | Manufacturer      | `Select`                | ✱        | `list_manufacturers`, `?has_items=true`, `results` |
| 2   | Rep / Assigned To | `Select`                | ✱        | transfer targets, `type === 'representative'`      |
| 3   | Physical Location | `Select`                | ✱        | facets ∪ the four mobile defaults                  |
| 4   | Kit Name          | `Select`                | ✱        | `list_parts`, `?kind=kit`, depends on #1           |
| 5   | Kit ID            | `Input`                 | ✱        | `manufacturer_kit_id`, max 64                      |
| 6   | Hansel Tracker    | `Input`                 |          | `beacon_id`; 409 lands under this field            |
| 7   | Type              | `Select`                | ✱        | owned / consigned / loaned, defaults **Consigned** |
| 8   | Status            | `RadioGroup`, two chips | ✱        | Complete / Incomplete, defaults **Complete**       |
| 9   | Photos            | photo strip             |          | optional, at most ten                              |
| 10  | Notes             | `Textarea`              |          | placeholder "Additional details..."                |

Placeholders come from the prototype and mobile, which agree: "Select Manufacturer...", "Select who
is accountable...", "Select where it's stored...", "Select kit...", "Scan or enter ID" → **"Enter
Kit ID"** here, since nothing scans, and "Beacon ID". Kit Name carries the hint "— From SurgiSync
catalog".

Field-by-field, where there is a rule:

**Manufacturer → Kit Name is a dependency, and changing it clears the selection.** Kit Name is
disabled with an explanatory placeholder until a manufacturer is chosen; picking a different
manufacturer resets `kitId` to null and refetches. Mobile does exactly this
(`onManufacturerSelected`, `load_inventory_controller.dart:358-372`) and the reason is that a kit
belongs to one manufacturer — a stale selection would file the stock under a manufacturer the user
did not pick, and the server derives it from the part, so nothing would reject it.

**Kit Name's empty state is a real state, not a defensive branch.** Manufacturer is the global
catalog and Kit Name is org-scoped (see above), so "this manufacturer has no kits you can receive"
is reachable through no fault of the user. Say that, rather than leaving an enabled select with
nothing in it.

**Physical Location** is free text on the server (`maxLength: 255`), and the facet endpoint returns
only values the org is already using. A brand-new org's list is therefore empty — a required select
with no options. Union the facets with mobile's four predefined names (`Warehouse`, `Vehicle`,
`Home`, `Storage Unit`, `load_inventory_controller.dart:53-58`), de-duplicated, sorted. Mobile also
lets the user create a location, persisted on the device; **that is out of scope** — there is no
server-side concept to persist it to, `localStorage` is the wrong home for something another user
will need to filter by, and one typo in a free-text column becomes a permanent extra option in
everyone's filter menu.

**Type** is `OwnershipTypeEnum` — `owned` / `consigned` / `loaned`, labelled with initial capitals.
Consigned is the default in both the prototype and mobile.

**Status** is a binary, not the eight-flag checklist Update Status shows. Mobile holds one
`isComplete` bool; the prototype's `tgReceiveStatus` lets you deselect both, which would leave a
required field empty and is a mockup artefact rather than a rule. Two chips styled like Update
Status's `StatusChip`, backed by a `RadioGroup`, defaulting to Complete. Send `is_complete` only —
the other five flags default correctly on the model, and sending them explicitly would put six
"Marked …" lines in the kit's history for a kit that was just created.

**Hansel Tracker** is optional and plain. The prototype's pair/unpair widget with its scan modal has
no browser equivalent; mobile's field is a text input labelled "Hansel Tracker" with the placeholder
"Beacon ID" and an inline error slot. Trim before sending and **omit the key entirely when blank** —
`attach_beacon` treats a blank value as a no-op, so sending `""` is harmless, but omitting it says
what is meant. Reuse `trackerErrorMessage` from `src/features/inventory/add-tracker.ts` for the
conflict copy rather than writing a second mapping; `create_inventory_kit` documents the same two
codes on its 409.

**Photos** follow Update Status, not the prototype. The prototype has one capture tile; mobile
allows up to ten with the first becoming primary. **They are optional here**, as in the SKU form;
mobile's Kit form required one (`hasRequired`, `load_inventory_controller.dart`) until it was
relaxed to match. Copy the strip from `update-status-dialog.tsx` — the
`label`-wrapping-an-`sr-only`-input affordance, the object-URL lifecycle and its revoke, the
positional "primary" marker on the first tile. The kit has no server photos here, so the strip holds
only staged files and needs none of `PhotoTile`'s uploaded/deleted states.

### 3. Submit

One full-width primary button, "Save Kit", disabled while in flight and showing the spinner
treatment the dialogs use. Validate on submit, not on change: mark the form submitted and only then
render the per-field errors, the way `showErrors` works in `update-status-dialog.tsx`.

**"Cancel" is deliberately absent.** There is nothing to cancel back to — this is a screen, not a
modal over one — and the nav is right there.

## Saving

Two phases with a latch, which is the single most important behaviour to carry across from mobile.

```
1. POST /api/v1/stock-items/            JSON, no photo   → 201 { id }
2. POST /api/v1/stock-items/{id}/photos/  multipart, one request per photo
```

**Split the sequence into its own module** — `receive-kit.save.ts`, modelled on
`update-status.save.ts`, which exists for this reason: the ordering and the latch are the two things
most worth testing and neither needs a DOM.

- **The latch is the kit id, and it is set only on a 201.** Once the kit exists, a second Save
  re-sends **only the outstanding photos** and never repeats the POST. Without it, saving again
  after one photo failed registers a second, duplicate kit — the user's mental model is "my save
  did not finish", and the form still holds everything needed to create another one.
- **Say so in the UI while that state is live.** Mobile shows a warning panel — "This kit is already
  saved. Edits to the fields above won't be applied — only its photos are still uploading." — and
  relabels the button **"Retry Photo Upload"** (`load_inventory_screen.dart:245-279, 336-340`).
  Carry both; a form that silently ignores edits is worse than one that says it will.
- **One photo per request, sequentially**, as `runSave` already does: they share a per-user throttle
  bucket and a parallel burst only makes the 429 harder to read. A failure does not stop the others
  — the uploads are independent, so stopping early just costs another round.
- There are no deletions here, so none of `runSave`'s uploads-before-deletions reasoning applies.
- **No `AbortSignal`.** Same reason as `runSave`: abandoning the sequence halfway leaves the server
  in a state this client can no longer describe.

**On full success**: `invalidate(stockItemKeys.all)` and `navigate({ to: '/inventory/on-hand' })`.
Both the prototype (`nav('onhand')`) and mobile (`Get.back()` to the list) leave the form. That one
prefix also refreshes the physical-location and manufacturer facet menus, which the new kit may have
just added a value to — the catalog queries are keyed separately and correctly stay put.

**Do not reset the form for a second kit.** Mobile's _SKU_ form does that, because SKUs are loaded
one after another; its _kit_ form pops back.

**Errors**, in three shapes, all of which already have a reader in `src/api/errors.ts`:

- **409** — `asConflict`, rendered under the Hansel Tracker field. `perform_create` is atomic
  (`views_inventory_kit.py:453-458`), so a beacon conflict rolls the kit insert back and **nothing
  was created**: leave the latch unset, keep every value, and let the next Save create the kit
  properly. Clear the message on the first edit to that field, so it never outlives the value that
  caused it.
- **400** — `asFieldErrors`, mapped onto the form's slots the way `statusFieldErrors` does. The map
  is small: `part` → Kit Name, `manufacturer_kit_id` → Kit ID, `assigned_to_representative` → Rep,
  `physical_location` → Location, `notes` → Notes, `quantity` → the form-level alert. Anything with
  no slot goes to the form-level alert rather than being dropped — and one such case is real and
  reachable: a user whose account is in no organization gets
  `{parent_company: ["Your account is not linked to an organization…"]}` from
  `perform_create`, which has no field on this form to land under.
- **Everything else** — `errorMessage`, in the form-level alert.

**The payload builder is pure and lives in `receive-kit.ts`:**

```ts
{
  part: number,                    // the catalog kit's pk
  manufacturer_kit_id: string,     // trimmed
  assigned_to_representative: number,
  physical_location: string,
  ownership_type: 'owned' | 'consigned' | 'loaned',
  is_complete: boolean,
  notes?: string,                  // omitted when blank
  beacon_id?: string,              // omitted when blank
}
```

**Send `part`, never `kit`.** `kit` is the deprecated alias — both are `UUIDOrPKRelatedField`s over
`Part.objects` sharing `source='part'`, and sending both with different values is rejected
(`serializers_inventory_kit.py:288-302, 343-355`). Mobile still sends `kit` only because it predates
the rename.

**Do not send `quantity`.** The column defaults to 1 (`models/stock_item.py:100`), kits are
serialized parts, and the serializer rejects anything but 1 for one — so the only values this form
could send are the default or a 400.

**Do not send `is_draft`.** Mobile sends `false` explicitly; that is the model default.

**Note what the generated types will not do for you.** `InventoryKitDetailRequest` declares no
`required` array, so every field types as optional — `part?: number` included, on a field the server
requires. The client-side required checks are the only thing standing between the user and a 400
round trip.

## Plumbing (read `orval.config.ts`'s header comment first)

- **`ALLOWED_OPERATIONS` gains three entries**: `create_inventory_kit`, `list_manufacturers` and
  `list_parts`. Comment them the way the existing blocks are — say why each path is safe, and for
  `list_manufacturers` say plainly that it is **not** inside the response-accuracy gate and why (the
  `manufacturers/kits/` operations sharing its prefix are undocumented), the way the
  `tracker_tracking_events` entry already does for `/trackers/`. `list_parts` needs no such caveat:
  its prefix is gated from its first commit, which is the point of putting it there.
  Then `pnpm api:pull` (the reshaped `list_manufacturers` and the new `list_parts` only exist in a
  fresh pull), `pnpm api:gen`, and commit `schema/openapi.yaml` and `src/api/generated/**` together.
  Update `schema/SOURCE.md`'s pulled-at row.
- **Call the plain exported functions, not the generated hooks.** orval is configured
  `query: { useQuery: true }`, so it emits `useCreateInventoryKit` as a _query_ — meaningless for a
  POST. `update-status.save.ts` imports the bare `apiV1StockItemsPartialUpdate` /
  `createInventoryKitPhoto` for the same reason; do the same and drive them from `useMutation`.
- **Query keys**: add a `catalogKeys` namespace to `inventory.keys.ts`, `['catalog']` rooted, with
  `manufacturers()` and `parts(manufacturerId, kind)`. **Do not hang it off `stockItemKeys`** — the
  catalog does not change when you receive a kit, and the success path invalidates that whole
  prefix, so sharing it would refetch the entire catalog after every save. Give both a `staleTime`
  like `facetQueries`' five minutes; a catalog changes far less often than stock does. Put `kind` in
  the key, not just the manufacturer: the SKU screen will ask the same endpoint for `component`, and
  a shared key would have whichever loaded last clobber the other — the same trap `trackerKeys`
  records for `pageSize`.
- **New files**: `receive-kit.ts` (validation, the payload builder, the 400 slot map),
  `receive-kit.save.ts` (the two-phase sequence), `receive.queries.ts` (the three option lists),
  `components/receive-screen.tsx` (the card, the mode buttons, the placeholder panels) and
  `components/receive-kit-form.tsx`. `receive.tsx` becomes a three-line route rendering the screen.
- **No new shadcn primitives.** `Card`, `Select`, `RadioGroup`, `Input`, `Textarea`, `Label` and
  `Button` are all vendored. If you reach for a searchable picker — mobile's manufacturer and kit
  pickers are searchable dialogs — **stop**: that is `Command`/`cmdk`, a new dependency and a new
  interaction pattern, and the prototype's plain `<select>` is what this screen specifies. A
  searchable combobox is a good later change for _every_ select on this app at once, not a one-off
  here.
- **Each option list needs a loading, empty and error state.** A required `Select` whose query
  failed and renders zero options is indistinguishable from one the org has no values for. Follow
  the Update Status pattern: disable while loading, and put a one-line muted message under the
  control on error ("Could not load manufacturers.").
- **The manufacturer query reads `results`.** The generated `PaginatedManufacturerList` also carries
  a deprecated `data` that duplicates it exactly, and it is going away once mobile's own fix ships —
  a screen built on it breaks with no type error. One page holds the whole catalog by design, so
  this screen does not page: ask for the first page and read `results`.

## Testing (Vitest + MSW; no new Playwright)

Copy the patterns in the sibling tests, including the Radix jsdom stub block from
`column-menu.test.tsx` — `Select` and `RadioGroup` both need it.

Pure modules first, because they hold the rules:

- `receive-kit.ts` — the payload omits `notes` and `beacon_id` when blank, trims `manufacturer_kit_id`
  and `beacon_id`, sends `part` and never `kit`, and sends neither `quantity` nor `is_draft`. The
  400 slot map routes `parent_company` to the form-level alert rather than dropping it.
- `receive-kit.save.ts` against MSW — **the latch is the test that matters most**: a run whose POST
  succeeds and whose second photo 500s, re-run, issues **no second POST** and re-uploads **only**
  the failed photo. Also: photos go one request at a time; a create failure uploads nothing.

Then the form:

- Save with an empty form shows the required errors and issues no request.
- Choosing a manufacturer enables Kit Name and fetches its kits; changing the manufacturer clears
  the chosen kit. Assert the request carries **`kind=kit`** — without it the picker offers loose
  components, which the create endpoint would accept, filing a component as though it were a kit.
- **The manufacturer options survive `data` being removed.** Have the MSW handler return a
  `PaginatedManufacturerList` with `results` and **no** `data`, and assert the picker still fills.
  This is the one test that fails if someone reads the deprecated key, and the deprecation is the
  whole reason the key is there.
- A manufacturer whose kit list comes back empty renders Kit Name's empty state, not an enabled
  select with nothing in it.
- A 409 renders the tracker copy under the Hansel Tracker field, keeps every other value, and
  editing that field clears it.
- A 400 on `manufacturer_kit_id` renders under Kit ID.
- Success invalidates `stockItemKeys.all` and navigates to `/inventory/on-hand`.
- Photos: zero saves, eleven blocks submit.

And the screen:

- The four mode buttons are radios in two groups, default Kit + Manual.
- Selecting SKU, or Bulk Upload, replaces the form with the placeholder and renders no form fields.

Gate on **`pnpm verify`**.

## Explicitly out of scope

SKU + Manual — the next brief, and the last of the ticket's Phase 2. Note it needs **no further
catalog endpoint**: `list_parts` above serves it with `?kind=component`, which is why this brief
asks for a Part list rather than a kit-shaped one · both Bulk Upload modes,
including the template download and the packing-slip photo the prototype shows · Quick Scan mode,
which the prototype offers for SKU only and which needs a scanner · barcode scanning of any kind ·
creating a physical location · the searchable-combobox upgrade · unsaved-changes warnings when
navigating away · editing a kit after creation, which is Kit Detail's job · any toast/notification
system.
