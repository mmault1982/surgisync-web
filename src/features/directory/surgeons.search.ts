import { z } from 'zod';

export const DEFAULT_PAGE_SIZE = 25;

/**
 * The Surgeons table's state, in the URL.
 *
 * `search` matches an NPI as well as a name, because someone holding a
 * provider number wants to know whether it is already on the roster — the same
 * question the duplicate rule answers.
 */
export const surgeonSearchSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1).default(1),
  page_size: z.coerce
    .number()
    .int()
    .min(10)
    .max(200)
    .catch(DEFAULT_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
  search: z.string().min(1).optional().catch(undefined),
});

export type SurgeonSearch = z.infer<typeof surgeonSearchSchema>;

export const SURGEON_DEFAULTS: SurgeonSearch = {
  page: 1,
  page_size: DEFAULT_PAGE_SIZE,
};

export function hasActiveSearch(search: SurgeonSearch): boolean {
  return Boolean(search.search);
}

export function toListParams(search: SurgeonSearch) {
  return {
    page: search.page,
    page_size: search.page_size,
    search: search.search,
  };
}
