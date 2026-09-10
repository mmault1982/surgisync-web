import { queryOptions, keepPreviousData } from '@tanstack/react-query';

import {
  listFacilitiesCatalog,
  retrieveFacilityDetail,
} from '@/api/generated/endpoints/inventory/inventory';

import { facilityKeys } from './directory.keys';
import { toListParams, type FacilitySearch } from './facilities.search';

export function facilityListQuery(search: FacilitySearch) {
  return queryOptions({
    queryKey: facilityKeys.list(search),
    queryFn: ({ signal }) => listFacilitiesCatalog(toListParams(search), undefined, signal),
    // Keeps the current page on screen while the next one loads, so typing in
    // the search box does not blank the table on every keystroke.
    placeholderData: keepPreviousData,
  });
}

/**
 * One facility and everything attached to it.
 *
 * The composite read: the role, the `Company` identity behind it, and that
 * company's address book, in a single request. Three round trips would
 * reassemble a join the client has no business learning.
 *
 * Deactivated facilities are readable through this, which is what makes
 * reactivation possible — the backend's detail queryset carries no `is_active`
 * filter for exactly that reason. So a 404 here means "not there, or not
 * yours", never "stood down".
 *
 * No `placeholderData`, unlike the list above: there is no previous record to
 * keep on screen, and showing one facility's licence numbers under another's
 * name while the next loads would be worse than a spinner.
 */
export function facilityDetailQuery(id: number) {
  return queryOptions({
    queryKey: facilityKeys.detail(id),
    queryFn: ({ signal }) => retrieveFacilityDetail(id, undefined, signal),
  });
}
