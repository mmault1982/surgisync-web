import type { ManufacturerSearch } from './manufacturers.search';
import type { ProcedureSearch } from './procedures.search';
import type { SurgeonSearch } from './surgeons.search';

/**
 * Query keys for the Directory Profiles section.
 *
 * Rooted separately from `catalogKeys` even though both read
 * `/api/v1/manufacturers/`, because they are different questions with
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
