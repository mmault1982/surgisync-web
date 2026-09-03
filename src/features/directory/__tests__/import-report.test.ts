import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';

import type { ImportReport, ImportRow } from '@/api/generated/model';

import {
  hasWork,
  rowReason,
  rowsToShow,
  summarise,
  uploadErrorMessage,
  workCount,
} from '../import-report';

function row(overrides: Partial<ImportRow> = {}): ImportRow {
  return { row: 2, name: 'Acme Ortho', outcome: 'created', ...overrides };
}

function report(overrides: Partial<ImportReport> = {}): ImportReport {
  return {
    dry_run: true,
    total_rows: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    rows: [],
    ...overrides,
  };
}

function apiError(status: number, body: unknown) {
  const error = new AxiosError('failed');
  error.response = {
    data: body,
    status,
    statusText: '',
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  };
  return error;
}

describe('summarise', () => {
  it('promises rather than reports while previewing', () => {
    expect(summarise(report({ dry_run: true, total_rows: 3, created: 3 }))).toBe(
      '3 rows: 3 to add.',
    );
  });

  it('reports once committed', () => {
    expect(summarise(report({ dry_run: false, total_rows: 3, created: 3 }))).toBe(
      '3 rows: 3 added.',
    );
  });

  it('names skips instead of folding them into a total', () => {
    // Re-running a file is a normal thing to do, and "already there" is the
    // answer that says so. Counting them as failures would make a working
    // merge look broken.
    expect(summarise(report({ dry_run: false, total_rows: 40, created: 5, skipped: 35 }))).toBe(
      '40 rows: 5 added, 35 already there.',
    );
  });

  it('separates problems from skips', () => {
    expect(
      summarise(report({ dry_run: true, total_rows: 3, created: 1, skipped: 1, failed: 1 })),
    ).toBe('3 rows: 1 to add, 1 already there, 1 with problems.');
  });

  it('says so when there is nothing to do', () => {
    expect(summarise(report({ total_rows: 0 }))).toBe('0 rows, nothing to do.');
  });

  it('names updates between adds and skips', () => {
    expect(
      summarise(report({ dry_run: true, total_rows: 12, created: 3, updated: 2, skipped: 7 })),
    ).toBe('12 rows: 3 to add, 2 to update, 7 already there.');
  });

  it('reports updates once committed', () => {
    expect(
      summarise(report({ dry_run: false, total_rows: 12, created: 3, updated: 2, skipped: 7 })),
    ).toBe('12 rows: 3 added, 2 updated, 7 already there.');
  });

  it('does not mention updates when there are none', () => {
    // The three directory importers can never report one, so their sentence
    // has to read exactly as it did before the outcome existed.
    expect(summarise(report({ dry_run: false, total_rows: 3, created: 3 }))).toBe(
      '3 rows: 3 added.',
    );
  });
});

describe('rowsToShow', () => {
  it('lists only what needs reading', () => {
    // A clean import of 400 names has nothing here; listing the successes
    // would bury the rows that matter.
    const result = rowsToShow(
      report({
        rows: [
          row({ row: 2, outcome: 'created' }),
          row({ row: 3, outcome: 'skipped', code: 'already_exists' }),
        ],
      }),
    );

    expect(result.map((entry) => entry.row)).toEqual([3]);
  });

  it('puts failures first, because they are the only actionable ones', () => {
    const result = rowsToShow(
      report({
        rows: [
          row({ row: 2, outcome: 'skipped' }),
          row({ row: 3, outcome: 'failed' }),
          row({ row: 4, outcome: 'skipped' }),
        ],
      }),
    );

    expect(result.map((entry) => entry.row)).toEqual([3, 2, 4]);
  });

  it('keeps spreadsheet order within a group', () => {
    const result = rowsToShow(
      report({
        rows: [row({ row: 9, outcome: 'failed' }), row({ row: 4, outcome: 'failed' })],
      }),
    );

    expect(result.map((entry) => entry.row)).toEqual([4, 9]);
  });

  it('ranks updates above skips and below failures', () => {
    // An update overwrites data that is already there, so a preview should
    // show which rows it will touch. A skip changes nothing and ranks last.
    const result = rowsToShow(
      report({
        rows: [
          row({ row: 2, outcome: 'skipped' }),
          row({ row: 3, outcome: 'updated' }),
          row({ row: 4, outcome: 'failed' }),
          row({ row: 5, outcome: 'created' }),
        ],
      }),
    );

    expect(result.map((entry) => entry.row)).toEqual([4, 3, 2]);
  });
});

describe('hasWork', () => {
  it('is false when every row is a skip, so the button can say so', () => {
    expect(hasWork(report({ total_rows: 5, skipped: 5 }))).toBe(false);
  });

  it('is true as soon as one row would be created', () => {
    expect(hasWork(report({ total_rows: 5, created: 1, skipped: 4 }))).toBe(true);
  });

  it('counts updates as work', () => {
    // A price list whose every row amends an existing part creates nothing.
    // Reading only `created` would disable the button and label a file that is
    // entirely work "Nothing to import".
    expect(hasWork(report({ total_rows: 5, updated: 5 }))).toBe(true);
  });
});

describe('workCount', () => {
  it('is what the commit button counts', () => {
    expect(workCount(report({ total_rows: 12, created: 3, updated: 2, skipped: 7 }))).toBe(5);
  });
});

describe('rowReason', () => {
  it('branches on the code, not the prose', () => {
    expect(rowReason(row({ outcome: 'skipped', code: 'already_exists', detail: 'whatever' }))).toBe(
      'Already in your list',
    );
    expect(rowReason(row({ outcome: 'failed', code: 'blank_name' }))).toBe('No name in this row');
  });

  it('falls back to the server text for a code it does not know', () => {
    // An unmapped code still carries something the user can act on, so it is
    // shown rather than replaced with a generic line.
    expect(rowReason(row({ outcome: 'failed', code: 'something_new', detail: 'Try again.' }))).toBe(
      'Try again.',
    );
  });

  it('has a last resort when there is no detail either', () => {
    expect(rowReason(row({ outcome: 'failed' }))).toBe('Could not be imported');
  });

  it('takes a per-entity map, because one code means different things', () => {
    // `already_exists` is reported by all four importers. Without a map, a
    // catalog row would read "Already in your list".
    const catalog = { already_exists: 'Already in your catalog, unchanged' };

    expect(rowReason(row({ outcome: 'skipped', code: 'already_exists' }), catalog)).toBe(
      'Already in your catalog, unchanged',
    );
  });

  it('still falls back to the server text under a custom map', () => {
    expect(
      rowReason(row({ outcome: 'failed', code: 'udi_taken', detail: 'Taken.' }), {
        already_exists: 'Already in your catalog',
      }),
    ).toBe('Taken.');
  });
});

describe('uploadErrorMessage', () => {
  it('lifts the file error, which is the whole of what the user needs', () => {
    const error = apiError(400, { file: ["Invalid file type '.txt'. Allowed types: .csv, .xlsx"] });

    expect(uploadErrorMessage(error)).toBe("Invalid file type '.txt'. Allowed types: .csv, .xlsx");
  });

  it('reads a payload-level error too', () => {
    const error = apiError(400, {
      non_field_errors: ['You must belong to an organization to import manufacturers.'],
    });

    expect(uploadErrorMessage(error)).toBe(
      'You must belong to an organization to import manufacturers.',
    );
  });

  it('falls back to the house message', () => {
    expect(uploadErrorMessage(apiError(500, {}))).toBeTruthy();
  });
});
