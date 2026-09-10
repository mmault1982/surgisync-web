import type { FacilitySearch } from './facilities.search';
import type { ManufacturerSearch } from './manufacturers.search';
import type { ProcedureSearch } from './procedures.search';
import type { SurgeonSearch } from './surgeons.search';

/**
 * Query keys for the Directory Profiles section.
 *
 * Rooted separately from `catalogKeys` even though both read
 * `/api/v1/directory/manufacturers/`, because they are different questions with
 * different lifetimes: the catalog key caches the *picker's* option list for
 * five minutes, this one caches a *page* of a table the user is editing. One
 * root would mean either a rename leaving the picker stale, or every save
 * refetching a list nobody is looking at.
 *
 * Writes here invalidate both — see `manufacturers-screen.tsx`.
 */
export const manufacturerKeys = {
  all: ['directory-manufacturers'] as const,
  list: (search: ManufacturerSearch) => [...manufacturerKeys.all, 'list', search] as const,
  /**
   * Every manufacturer's composite document — the prefix an address write
   * invalidates.
   *
   * The prefix rather than one id, because the address book belongs to the
   * shared `Company` identity and not to the role: two manufacturer rows this
   * organization owns may point at one company, and editing an address through
   * either has to leave both stale. That is the case the backend gave these
   * writes their own URL for. At most a couple of documents are ever cached, so
   * the width costs nothing.
   *
   * Not `all`: the *listing* shows a name and whether a barcode exists, neither
   * of which an address can change.
   */
  details: () => [...manufacturerKeys.all, 'detail'] as const,
  /**
   * One manufacturer's composite document — the role, its `Company` identity
   * and that company's addresses, in one read.
   *
   * A sibling of `list`, not a child of it, the same split
   * `productCatalogKeys.detail` makes.
   */
  detail: (id: number) => [...manufacturerKeys.details(), id] as const,
};

/**
 * Facilities, their own root.
 *
 * Like `manufacturerKeys` and unlike the other two, a write here has to
 * invalidate a **second** root — `transferKeys.targets()`, the Transfer
 * dialog's destination picker. That endpoint builds its facility half from
 * `Facility.objects.filter(is_active=True)`, so deactivating a facility takes
 * it out of the picker, reactivating puts it back, and renaming one relabels
 * it. None of that is visible from this feature, which is exactly why it is
 * written down here rather than left to be rediscovered — see
 * `facilities-screen.tsx`, which declares the pair.
 *
 * `list_stock_item_facility_facets` is deliberately *not* a third root. It is
 * derived from stock assignments rather than from `is_active`, so a
 * deactivation cannot stale it; a rename can stale its labels, but
 * manufacturers has the identical exposure through
 * `list_stock_item_manufacturer_facets` and deliberately leaves it alone.
 */
export const facilityKeys = {
  all: ['directory-facilities'] as const,
  list: (search: FacilitySearch) => [...facilityKeys.all, 'list', search] as const,
  /**
   * Every facility's composite document — the prefix an address write
   * invalidates.
   *
   * The prefix rather than one id, for the reason `manufacturerKeys.details()`
   * gives: the address book belongs to the shared `Company`, so two roles this
   * organization owns may point at one book and editing through either has to
   * leave both stale.
   *
   * Not `all`: the *listing* shows a name, a type and two statuses, none of
   * which an address can change.
   */
  details: () => [...facilityKeys.all, 'detail'] as const,
  detail: (id: number) => [...facilityKeys.details(), id] as const,
};

/**
 * Procedures are their own root.
 *
 * Not folded in with manufacturers despite the identical shape: they are
 * separate resources with separate lifetimes, and one root would mean adding a
 * procedure refetches the manufacturers table for no reason.
 *
 * Unlike `manufacturerKeys` there is no second root to invalidate alongside
 * this one — nothing else in this app reads procedures yet. The legacy
 * `/procedure_names/` lookup the mobile app uses has no client here.
 */
export const procedureKeys = {
  all: ['directory-procedures'] as const,
  list: (search: ProcedureSearch) => [...procedureKeys.all, 'list', search] as const,
};

/**
 * Surgeons, likewise their own root.
 *
 * Nothing else in this app reads them yet — the legacy `/surgeons/` lookup the
 * mobile app uses has no client here — so there is no second root to
 * invalidate alongside it, as manufacturers has with the receive picker.
 */
export const surgeonKeys = {
  all: ['directory-surgeons'] as const,
  list: (search: SurgeonSearch) => [...surgeonKeys.all, 'list', search] as const,
};
