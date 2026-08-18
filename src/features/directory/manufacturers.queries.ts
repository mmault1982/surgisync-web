import { queryOptions, keepPreviousData } from '@tanstack/react-query';

import { listManufacturers } from '@/api/generated/endpoints/inventory/inventory';

import { manufacturerKeys } from './directory.keys';
import { toListParams, type ManufacturerSearch } from './manufacturers.search';

export function manufacturerListQuery(search: ManufacturerSearch) {
  return queryOptions({
    queryKey: manufacturerKeys.list(search),
    queryFn: ({ signal }) => listManufacturers(toListParams(search), undefined, signal),
    // Keeps the current page on screen while the next one loads, so typing in
    // the search box does not blank the table on every keystroke.
    placeholderData: keepPreviousData,
  });
}
