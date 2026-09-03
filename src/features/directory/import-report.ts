import { asFieldErrors, errorMessage } from '@/api/errors';
import type { ImportReport, ImportRow } from '@/api/generated/model';
import { OutcomeEnum } from '@/api/generated/model';

/**
 * Everything an import dialog decides, with no DOM in sight.
 *
 * Entity-neutral, and it always was — `summarise`, `rowsToShow` and `hasWork`
 * only ever read counts and outcomes. It was named for manufacturers because
 * they were the only caller; procedures is the second, and the backend's
 * report serializer became entity-neutral in the same change, so the names
 * here follow.
 *
 * The same split as `receive-sku.ts`: the arithmetic and the copy live here so
 * they can be tested without a render, and the component is left with wiring.
 */

/**
 * A per-entity map from a row's `code` to display copy.
 *
 * Passed rather than switched on, because the four importers no longer share a
 * vocabulary: the directory ones report on a name column, the catalog ones on
 * eight columns and a bill of materials. One growing switch would make every
 * screen carry every other screen's copy.
 */
export type RowReasons = Readonly<Record<string, string>>;

/**
 * The headline sentence for a report.
 *
 * Reads differently before and after committing, because "12 will be created"
 * and "12 created" are different promises and the dialog shows both in turn.
 * Skips are named rather than folded into a total: re-running a file is a
 * normal thing to do, and "35 already there" is the answer that says so.
 *
 * Updates are named separately for the same reason in reverse — a catalog
 * import that amends 40 prices has changed something, and folding those into
 * "already there" would say the opposite. The directory importers never report
 * any, so their sentence is unchanged.
 */
export function summarise(report: ImportReport): string {
  const parts: string[] = [];

  if (report.created > 0) parts.push(`${report.created} ${report.dry_run ? 'to add' : 'added'}`);
  if (report.updated > 0) {
    parts.push(`${report.updated} ${report.dry_run ? 'to update' : 'updated'}`);
  }
  if (report.skipped > 0) parts.push(`${report.skipped} already there`);
  if (report.failed > 0) parts.push(`${report.failed} with problems`);

  if (parts.length === 0) return `${report.total_rows} rows, nothing to do.`;
  return `${report.total_rows} rows: ${parts.join(', ')}.`;
}

/**
 * Rows worth showing, problems first.
 *
 * A clean import of 400 names has nothing to read, so listing every row would
 * bury the two that need attention. Failures come first because they are the
 * only ones the user can act on; updates follow, because a preview that is
 * about to overwrite existing data should say which rows it will touch; skips
 * last, because "why did nothing happen?" is the least urgent question and the
 * answer is "nothing needed to". Created rows are counted, not listed.
 *
 * The rank map is typed on `OutcomeEnum` rather than inferred: it began as an
 * object literal over three outcomes, and a fourth arriving would otherwise
 * have made the lookup `undefined` at runtime and silently unsorted.
 */
export function rowsToShow(report: ImportReport): ImportRow[] {
  const rank: Record<OutcomeEnum, number> = {
    [OutcomeEnum.failed]: 0,
    [OutcomeEnum.updated]: 1,
    [OutcomeEnum.skipped]: 2,
    [OutcomeEnum.created]: 3,
  };
  return report.rows
    .filter((row) => row.outcome !== OutcomeEnum.created)
    .sort((a, b) => rank[a.outcome] - rank[b.outcome] || a.row - b.row);
}

/**
 * True when committing would write something.
 *
 * Updates count. A price list whose every row amends an existing part has
 * `created === 0`, and reading only that would disable the commit button and
 * label it "Nothing to import" on a file that is entirely work.
 */
export function hasWork(report: ImportReport): boolean {
  return report.created + report.updated > 0;
}

/** How many records a commit would write — the number on the button. */
export function workCount(report: ImportReport): number {
  return report.created + report.updated;
}

/** The directory importers' codes: one name column, four ways to fail it. */
export const DIRECTORY_REASONS: RowReasons = {
  already_exists: 'Already in your list',
  blank_name: 'No name in this row',
  name_too_long: 'Name is too long',
  missing_column: 'No name column — the file needs a column headed “name”',
};

/**
 * Why a row did not land.
 *
 * Branches on `code`, never on `detail` — the server says `detail` may change.
 * The fallback is the server's own text rather than a generic line, because an
 * unmapped code still carries something the user can act on, and the catalog
 * importers report far more codes than any screen wants to restate.
 */
export function rowReason(row: ImportRow, reasons: RowReasons = DIRECTORY_REASONS): string {
  return reasons[row.code ?? ''] ?? row.detail ?? 'Could not be imported';
}

/**
 * What went wrong with the upload itself.
 *
 * A file the server could not read at all comes back as a 400 keyed on
 * `file` — wrong extension, empty, no header, too many rows. That message is
 * the whole of what the user needs, so it is lifted out rather than left to
 * the generic handler.
 */
export function uploadErrorMessage(error: unknown): string {
  const fields = asFieldErrors(error);
  const fileError = fields?.file?.[0];
  if (fileError) return fileError;

  const nonField = fields?.non_field_errors?.[0];
  if (nonField) return nonField;

  return errorMessage(error);
}
