import { z } from 'zod';

import { FacilityTypeEnum } from '@/api/generated/model';

export const DEFAULT_PAGE_SIZE = 25;

/**
 * The active/deactivated filter, and `undefined` is a real answer rather than a
 * missing one: the endpoint has no default here and returns active *and*
 * deactivated rows when the parameter is absent. That is deliberate on its side
 * — a deactivation is a state this screen exists to show and undo, not a
 * removal — so "All" is the honest default here too.
 *
 * **Deliberately not `on-hand.search.ts`'s `z.coerce.boolean()`.** The router
 * JSON-decodes search values and falls back to the raw string when that fails,
 * so `?is_active=False` (or `no`, or anything not valid JSON) arrives here as a
 * *string* — and `Boolean('False')` is `true`. On on-hand that inverts a
 * cosmetic filter; here it would answer "show me the deactivated ones" with the
 * active ones, silently, which is the screen's whole subject. Parsing the two
 * literals explicitly and letting everything else fall to `.catch(undefined)`
 * means a mangled URL degrades to "All" rather than to the opposite of what was
 * asked for.
 */
const tristate = z
  .preprocess((value) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  }, z.boolean())
  .optional()
  .catch(undefined);

/**
 * The Facilities table's state, in the URL.
 *
 * Cut down from `on-hand.search.ts` and grown from `manufacturers.search.ts`:
 * no sort, because the server returns one order (by name), but two filters
 * rather than none, because type and active state are axes the search box
 * cannot express.
 *
 * The endpoint also filters on `onboarding_status` and this screen
 * deliberately does not. The table still shows it as a column — it is worth
 * seeing at a glance — but it is not something to narrow the catalog by, and
 * nothing in this app writes it either (see `facility-form.ts`). Adding it
 * back means this key, a control in the header, and a case in
 * `hasActiveFilters`.
 *
 * Every field is `.catch(...)`-guarded for the same reason as on-hand — a
 * hand-edited or stale URL should degrade to the default rather than throw a
 * route error at someone who only mistyped a page number.
 *
 * The two enums come from the generated model rather than being restated, so
 * a value the backend drops breaks `pnpm typecheck` here instead of 400-ing in
 * production.
 *
 * ## Why the type filter is single-valued
 *
 * The contract declares `facility_type` as `type: string`, even though its
 * description says "Repeatable" and the view reads it with `getlist`.
 * `/stock-items/` declares its repeatable params as `type: array` and gets
 * `string[]` out of orval; this one gets `string`. So a single-select is what
 * the generated client can actually express, and widening it here would mean
 * casting past the contract — which `orval.config.ts` records as the thing
 * this project does not do. It is a backend schema bug; when it is fixed this
 * becomes `asList(...)` and the control becomes a checklist.
 */
export const facilitySearchSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1).default(1),
  page_size: z.coerce
    .number()
    .int()
    .min(10)
    .max(200)
    .catch(DEFAULT_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
  search: z.string().min(1).optional().catch(undefined),
  facility_type: z.enum(FacilityTypeEnum).optional().catch(undefined),
  is_active: tristate,
});

export type FacilitySearch = z.infer<typeof facilitySearchSchema>;

export const FACILITY_DEFAULTS: FacilitySearch = {
  page: 1,
  page_size: DEFAULT_PAGE_SIZE,
};

/** True when anything narrows the list, so the empty state can say which case it is. */
export function hasActiveFilters(search: FacilitySearch): boolean {
  return Boolean(search.search || search.facility_type || search.is_active !== undefined);
}

/**
 * A deliberate pass-through: the search param names were chosen to match the
 * API's, so `tsc` catches any drift rather than a filter silently doing
 * nothing. Same reasoning as `toListParams` on the on-hand screen.
 */
export function toListParams(search: FacilitySearch) {
  return {
    page: search.page,
    page_size: search.page_size,
    search: search.search,
    facility_type: search.facility_type,
    is_active: search.is_active,
  };
}
