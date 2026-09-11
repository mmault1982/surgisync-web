import type { RowReasons } from './import-report';

/**
 * Display copy for the manufacturer importer's row codes.
 *
 * A short map rather than a restatement of all twelve codes the importer can
 * report. `rowReason` falls back to the server's own `detail`, and for the wide
 * columns that text is the better one — it names the column that was too long,
 * the address the row was in, the fields that changed. Copying those strings
 * here would create two places to keep one sentence, and the client's copy
 * would be the stale one.
 *
 * So this maps exactly two kinds of code, the same rule `PARTS_REASONS` follows:
 *
 * 1. **Codes `DIRECTORY_REASONS` now gets wrong.** `already_exists` used to mean
 *    "there is nothing here to amend" and now means "the file agrees in every
 *    stated field" — a real narrowing, since the importer amends. And
 *    `missing_column` points at a template that is no longer one column.
 *    Overridden here rather than edited in the shared map, which procedures and
 *    surgeons still read and for which the old wording is still exactly right.
 * 2. **Codes where a short phrase says everything the sentence does.** A table
 *    cell is narrow.
 *
 * `value_too_long`, `invalid_email`, `invalid_country` and
 * `conflicting_duplicate_in_file` are deliberately absent: each names a specific
 * column or row in its `detail`, which is what the user needs in order to fix it.
 * `fields_updated` too — its detail is the list of what changed.
 */
export const MANUFACTURER_REASONS: RowReasons = {
  already_exists: 'Already there, and the file agrees',
  missing_column: 'Wrong columns — download the manufacturers template',
  blank_name: 'No name in this row',
  name_too_long: 'Name is too long',
  duplicate_in_file: 'Listed earlier in this file, identically',
  invalid_address_kind: 'Not a valid address kind',
  ambiguous_manufacturer: 'Two of your manufacturers are spelled this way',
};
