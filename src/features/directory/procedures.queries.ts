import { queryOptions, keepPreviousData } from '@tanstack/react-query';

import { listProceduresCatalog } from '@/api/generated/endpoints/inventory/inventory';

import { procedureKeys } from './directory.keys';
import { toListParams, type ProcedureSearch } from './procedures.search';

export function procedureListQuery(search: ProcedureSearch) {
  return queryOptions({
    queryKey: procedureKeys.list(search),
    queryFn: ({ signal }) => listProceduresCatalog(toListParams(search), undefined, signal),
    // Keeps the current page on screen while the next one loads, so typing in
    // the search box does not blank the table on every keystroke.
    placeholderData: keepPreviousData,
  });
}
