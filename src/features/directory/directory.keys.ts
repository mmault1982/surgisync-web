import type { ManufacturerSearch } from './manufacturers.search';

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
