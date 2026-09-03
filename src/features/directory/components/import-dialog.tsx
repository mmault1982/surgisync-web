import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheetIcon } from 'lucide-react';
import { useState } from 'react';

import type { ImportReport } from '@/api/generated/model';
import { OutcomeEnum } from '@/api/generated/model';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

import type { RowReasons } from '../import-report';
import {
  hasWork,
  rowReason,
  rowsToShow,
  summarise,
  uploadErrorMessage,
  workCount,
} from '../import-report';

/**
 * Import records from a CSV or Excel file.
 *
 * Three steps in one dialog: pick a file, read what would happen, confirm.
 * The preview is the same server call with `dry_run` set, so what it shows is
 * what the commit does rather than a client-side guess.
 *
 * The file is posted twice — once to preview, once to commit — because there
 * is no server-side staging and a JWT session has nowhere to keep one. That is
 * affordable precisely because these imports merge: if another admin adds a
 * row in between, the commit turns a `created` into a `skipped` or an
 * `updated` and says so.
 *
 * Entity-neutral. It started out as the manufacturers dialog; procedures is
 * the second caller and differs only in its copy, its two generated calls and
 * which caches to refresh, so those became props rather than a second copy of
 * 270 lines. This project promotes on the second caller — see
 * `table-states.tsx` and `field.tsx`.
 */
export interface ImportDialogProps {
  /** Dialog title, e.g. "Import manufacturers". */
  title: string;
  /** What the file should contain, and what happens to names already present. */
  description: React.ReactNode;
  /** The generated import call, with `dry_run` threaded through. */
  onImport: (file: File, dryRun: boolean) => Promise<ImportReport>;
  /** The generated template download, returning the CSV body. */
  onTemplate: () => Promise<Blob>;
  templateFilename: string;
  /**
   * Display copy for this entity's row `code`s.
   *
   * Omitted by the directory screens, which take the default map — they all
   * report on one name column. The catalog importers have a much larger and
   * entirely different vocabulary, so they pass their own rather than growing
   * a switch every screen would carry.
   */
  reasons?: RowReasons;
  /**
   * Every query root a successful commit invalidates.
   *
   * More than one because these lists are read in two places under different
   * keys — the screen's table and a picker elsewhere with its own staleTime.
   */
  invalidates: readonly (readonly unknown[])[];
  onClose: () => void;
}

export function ImportDialog({
  title,
  description,
  onImport,
  onTemplate,
  templateFilename,
  reasons,
  invalidates,
  onClose,
}: ImportDialogProps) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [committed, setCommitted] = useState(false);

  const send = useMutation({
    // One request. A retried commit would not double-create — the second run
    // skips what the first made — but it would report every row as already
    // there, which reads as a failure.
    retry: false,
    mutationFn: ({ upload, dryRun }: { upload: File; dryRun: boolean }) => onImport(upload, dryRun),
    onSuccess: async (next) => {
      setReport(next);
      if (next.dry_run) return;

      setCommitted(true);
      // Every root the caller named. Manufacturers passes two, because the
      // receive forms' picker reads the same endpoint under `catalogKeys` with
      // its own staleTime — though note imported manufacturers still will not
      // appear there until they have catalog parts, which the Manufacturers
      // screen says out loud.
      await Promise.all(invalidates.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
  });

  function pick(next: File | null) {
    setFile(next);
    setReport(null);
    setCommitted(false);
    send.reset();
    if (next) send.mutate({ upload: next, dryRun: true });
  }

  /**
   * Save the template to disk.
   *
   * Not a plain `<a href download>`: the endpoint is admin-gated and the
   * access token lives in memory, so an unauthenticated browser navigation
   * would 401. The generated call returns a Blob — declared `responseType:
   * 'blob'` because the operation answers text/csv — so the download has to be
   * driven from it. Object URL revoked immediately; the click is synchronous.
   */
  const template = useMutation({
    retry: false,
    mutationFn: () => onTemplate(),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = templateFilename;
      anchor.click();
      URL.revokeObjectURL(url);
    },
  });

  const busy = send.isPending;
  const problems = report ? rowsToShow(report) : [];

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div>
            {/*
              A label wrapping an sr-only input, not a button that clicks a
              hidden one: the affordance the user touches *is* the control, so
              it gets keyboard activation and an accessible name for free. Same
              pattern as PhotoCapture.
            */}
            <label
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed p-4 text-sm',
                file
                  ? 'border-solid border-success bg-success-container'
                  : 'border-primary bg-brand-container',
                busy && 'pointer-events-none opacity-60',
              )}
            >
              <FileSpreadsheetIcon className="size-6 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-gray-900">
                  {file ? file.name : 'Choose a .csv or .xlsx file'}
                </span>
                <span className="block text-muted-foreground">
                  {file ? 'Click to choose a different file' : 'Up to 10MB and 2000 rows'}
                </span>
              </span>
              <input
                type="file"
                accept=".csv,.xlsx"
                className="sr-only"
                disabled={busy}
                onChange={(event) => {
                  pick(event.target.files?.[0] ?? null);
                  // Without this, picking the same file twice in a row fires
                  // no change event — so a re-try after fixing the spreadsheet
                  // would appear to do nothing.
                  event.target.value = '';
                }}
              />
            </label>

            <button
              type="button"
              className="mt-2 text-sm text-primary underline-offset-2 hover:underline disabled:opacity-60"
              disabled={template.isPending}
              onClick={() => template.mutate()}
            >
              Download a template
            </button>
            {template.error ? (
              <p role="alert" className="mt-1 text-sm text-destructive">
                Could not download the template.
              </p>
            ) : null}
          </div>

          {busy ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <span
                role="status"
                aria-label={report ? 'Importing' : 'Checking the file'}
                className="size-4 animate-spin rounded-full border-2 border-brand/30 border-t-brand"
              />
              {report ? 'Importing…' : 'Checking the file…'}
            </p>
          ) : null}

          {send.error ? (
            <p role="alert" className="text-sm text-destructive">
              {uploadErrorMessage(send.error)}
            </p>
          ) : null}

          {report && !busy ? (
            <div className="rounded-lg border border-gray-200">
              <p
                role="status"
                className={cn(
                  'border-b border-gray-200 px-4 py-2 text-sm font-medium',
                  committed ? 'bg-success-container' : 'bg-gray-50',
                )}
              >
                {summarise(report)}
              </p>

              {problems.length > 0 ? (
                // Only rows that need reading. A clean import of 400 names has
                // nothing here, and listing the successes would bury the two
                // that matter.
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left">
                        <th scope="col" className="w-16 px-4 py-2 font-medium text-gray-700">
                          Row
                        </th>
                        <th scope="col" className="px-4 py-2 font-medium text-gray-700">
                          Name
                        </th>
                        <th scope="col" className="px-4 py-2 font-medium text-gray-700">
                          Result
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {problems.map((row) => (
                        <tr key={row.row} className="border-b border-gray-100 last:border-0">
                          <td className="px-4 py-2 text-muted-foreground">{row.row}</td>
                          <td className="px-4 py-2">{row.name || '—'}</td>
                          <td
                            className={cn(
                              'px-4 py-2',
                              row.outcome === OutcomeEnum.failed
                                ? 'text-destructive'
                                : 'text-muted-foreground',
                            )}
                          >
                            {rowReason(row, reasons)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {committed ? 'Done' : 'Cancel'}
          </Button>
          {!committed ? (
            <Button
              type="button"
              disabled={busy || !file || !report || !hasWork(report)}
              onClick={() => file && send.mutate({ upload: file, dryRun: false })}
            >
              {report && !hasWork(report)
                ? 'Nothing to import'
                : `Import ${report ? workCount(report) : 0}`}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
