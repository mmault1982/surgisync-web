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

/** Where the dialog is in the upload → preview → commit sequence. */
export type ImportStage = 'choose' | 'preview' | 'done';

/**
 * The headline sentence for a report.
 *
 * Reads differently before and after committing, because "12 will be created"
 * and "12 created" are different promises and the dialog shows both in turn.
 * Skips are named rather than folded into a total: re-running a file is a
 * normal thing to do, and "35 already there" is the answer that says so.
 */
export function summarise(report: ImportReport): string {
  const parts: string[] = [];
  const verb = report.dry_run ? 'to add' : 'added';

  if (report.created > 0) parts.push(`${report.created} ${verb}`);
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
 * only ones the user can act on; skips follow, because "why did nothing
 * happen?" is the next question. Created rows are counted, not listed.
 */
export function rowsToShow(report: ImportReport): ImportRow[] {
  const rank = { [OutcomeEnum.failed]: 0, [OutcomeEnum.skipped]: 1, [OutcomeEnum.created]: 2 };
  return report.rows
    .filter((row) => row.outcome !== OutcomeEnum.created)
    .sort((a, b) => rank[a.outcome] - rank[b.outcome] || a.row - b.row);
}

/** True when committing would write something. */
export function hasWork(report: ImportReport): boolean {
  return report.created > 0;
}

/**
 * Why a row did not become a manufacturer.
 *
 * Branches on `code`, never on `detail` — the server says `detail` may change.
 * The fallback is the server's own text rather than a generic line, because an
 * unmapped code still carries something the user can act on.
 */
export function rowReason(row: ImportRow): string {
  switch (row.code) {
    case 'already_exists':
      return 'Already in your list';
    case 'blank_name':
      return 'No name in this row';
    case 'name_too_long':
      return 'Name is too long';
    case 'missing_column':
      return 'No name column — the file needs a column headed “name”';
    default:
      return row.detail || 'Could not be imported';
  }
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
