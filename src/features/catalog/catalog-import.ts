import type { RowReasons } from '@/features/directory/import-report';

/**
 * Display copy for the catalog importers' row codes.
 *
 * Deliberately short maps rather than a restatement of all twenty-odd codes
 * each importer can report. `rowReason` falls back to the server's own
 * `detail`, and for the catalog that text is usually the better one — it names
 * the manufacturer that was not found, the reference number that was
 * ambiguous, the fields that changed. Copying those strings here would create
 * two places to keep one sentence, and the client's copy would be the stale
 * one.
 *
 * So these map exactly two kinds of code:
 *
 * 1. **Codes the default directory map would get wrong.** `already_exists` and
 *    `missing_column` are reported by all four importers and mean different
 *    things in each; without an entry here a catalog row would read "Already
 *    in your list" and point at a `name` column that does not exist in either
 *    catalog file.
 * 2. **Codes where a short phrase says everything the sentence does.** A table
 *    cell is narrow, and "A kit cannot contain itself" needs no elaboration.
 */

export const PARTS_REASONS: RowReasons = {
  already_exists: 'Already in your catalog, unchanged',
  missing_column: 'Wrong columns — download the parts template',
  blank_manufacturer: 'No manufacturer in this row',
  blank_description: 'No description in this row',
  missing_reference_number: 'A component needs a reference number',
  reference_number_on_kit: 'Kits carry no reference number',
  is_serialized_on_kit: 'Kits are always serialized',
};

export const BOM_REASONS: RowReasons = {
  already_exists: 'Already in this kit at this quantity',
  missing_column: 'Wrong columns — download the bill-of-materials template',
  blank_manufacturer: 'No manufacturer in this row',
  blank_kit_description: 'No kit named in this row',
  no_component_column: 'No component named in this row',
  both_component_columns: 'Two components named in one row',
  self_containment: 'A kit cannot contain itself',
  restored: 'Put back into the kit',
};
