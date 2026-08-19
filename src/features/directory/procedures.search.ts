import { z } from 'zod';

export const DEFAULT_PAGE_SIZE = 25;

/**
 * The Procedures table's state, in the URL.
 *
 * Identical in shape to `manufacturers.search.ts` and deliberately left as its
 * own file: a zod schema is typed to its own parameter names, and a shared
 * factory would trade four lines of duplication for a generic that has to be
 * read to know what a URL means.
 */
export const procedureSearchSchema = z.object({
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

export type ProcedureSearch = z.infer<typeof procedureSearchSchema>;

export const PROCEDURE_DEFAULTS: ProcedureSearch = {
  page: 1,
  page_size: DEFAULT_PAGE_SIZE,
};

export function hasActiveSearch(search: ProcedureSearch): boolean {
  return Boolean(search.search);
}

/** A pass-through: the names match the API's, so `tsc` catches any drift. */
export function toListParams(search: ProcedureSearch) {
  return {
    page: search.page,
    page_size: search.page_size,
    search: search.search,
  };
}
