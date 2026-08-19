import { queryOptions, keepPreviousData } from '@tanstack/react-query';

import { listSurgeonsCatalog } from '@/api/generated/endpoints/inventory/inventory';

import { surgeonKeys } from './directory.keys';
import { toListParams, type SurgeonSearch } from './surgeons.search';

export function surgeonListQuery(search: SurgeonSearch) {
  return queryOptions({
    queryKey: surgeonKeys.list(search),
    queryFn: ({ signal }) => listSurgeonsCatalog(toListParams(search), undefined, signal),
    placeholderData: keepPreviousData,
  });
}
