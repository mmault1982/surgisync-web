import { queryOptions, keepPreviousData } from '@tanstack/react-query';

import {
  listManufacturersCatalog,
  retrieveManufacturerDetail,
} from '@/api/generated/endpoints/inventory/inventory';

import { manufacturerKeys } from './directory.keys';
import { toListParams, type ManufacturerSearch } from './manufacturers.search';

export function manufacturerListQuery(search: ManufacturerSearch) {
  return queryOptions({
    queryKey: manufacturerKeys.list(search),
    queryFn: ({ signal }) => listManufacturersCatalog(toListParams(search), undefined, signal),
    // Keeps the current page on screen while the next one loads, so typing in
    // the search box does not blank the table on every keystroke.
    placeholderData: keepPreviousData,
  });
}

/**
 * One manufacturer and everything attached to it.
 *
 * The composite read: the role, the `Company` identity behind it, and that
 * company's address book, in a single request. Three round trips would
 * reassemble a join the client has no business learning — and the chain is
 * still moving, since Company's flat address columns are dropped in a later
 * backend stage.
 *
 * No `placeholderData`, unlike the list above: there is no previous record to
 * keep on screen, and showing one manufacturer's details under another's name
 * while the next loads would be worse than a spinner.
 */
export function manufacturerDetailQuery(id: number) {
  return queryOptions({
    queryKey: manufacturerKeys.detail(id),
    queryFn: ({ signal }) => retrieveManufacturerDetail(id, undefined, signal),
  });
}
