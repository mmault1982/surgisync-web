import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ImportReport } from '@/api/generated/model';
import { server } from '@/test/msw/server';

import {
  importManufacturers,
  manufacturerImportTemplate,
} from '@/api/generated/endpoints/inventory/inventory';

import { ImportDialog } from '../components/import-dialog';

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

const IMPORT = '/api/v1/manufacturers/import/';

function report(overrides: Partial<ImportReport> = {}): ImportReport {
  return {
    dry_run: true,
    total_rows: 2,
    created: 2,
    skipped: 0,
    failed: 0,
    rows: [
      { row: 2, name: 'Acme Ortho', outcome: 'created' },
      { row: 3, name: 'Beta Devices', outcome: 'created' },
    ],
    ...overrides,
  };
}

function csv(name = 'manufacturers.csv') {
  return new File(['name\nAcme Ortho\nBeta Devices\n'], name, { type: 'text/csv' });
}

function renderDialog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={client}>
      {/* Configured as the Manufacturers screen configures it, so the test
          exercises a real wiring rather than a bespoke one. */}
      <ImportDialog
        title="Import manufacturers"
        description="A CSV or Excel file with a single column headed name."
        onImport={(file, dryRun) => importManufacturers({ file, dry_run: dryRun })}
        onTemplate={() => manufacturerImportTemplate()}
        templateFilename="manufacturers_template.csv"
        invalidates={[['directory-manufacturers'], ['catalog']]}
        onClose={onClose}
      />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), onClose };
}

const fileInput = () => screen.getByLabelText(/Choose a \.csv|Click to choose/i);
const importButton = () => screen.getByRole('button', { name: /^Import|Nothing to import/ });

/**
 * The raw multipart body of every POST that went out.
 *
 * Deliberately not `request.formData()`: jsdom's XHR serialises a `File` as an
 * anonymous blob and undici's multipart parser rejects the result outright, so
 * the handler throws and no call is ever recorded. `transfer-dialog.test.tsx`
 * hit the same wall. Reading the bytes is the stronger assertion anyway — the
 * dry_run flag's *encoding* is what decides whether the server writes.
 */
let posted: string[];

function fieldOf(raw: string, name: string): string {
  const match = new RegExp(`name="${name}"\\r?\\n\\r?\\n([^\\r\\n]*)`).exec(raw);
  return match?.[1] ?? '';
}

/**
 * The `dry_run` flag of each call, in order.
 *
 * Only the flag: jsdom's XHR serialises a `File` as an anonymous blob, so the
 * filename on the wire is literally "blob" and cannot be asserted here. That
 * the same file goes out twice is covered by driving the dialog, not by
 * reading the body — the component holds one `File` in state and has no way to
 * produce a second.
 */
const flags = () => posted.map((raw) => fieldOf(raw, 'dry_run'));

beforeEach(() => {
  posted = [];
  server.use(
    http.post(IMPORT, async ({ request }) => {
      const raw = await request.text();
      posted.push(raw);
      return HttpResponse.json(report({ dry_run: fieldOf(raw, 'dry_run') === 'true' }));
    }),
  );
});

describe('previewing', () => {
  it('previews as soon as a file is chosen, without writing', async () => {
    const { user } = renderDialog();

    await user.upload(fileInput(), csv());

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(flags()).toEqual(['true']);
    expect(await screen.findByText('2 rows: 2 to add.')).toBeInTheDocument();
  });

  it('names the chosen file', async () => {
    const { user } = renderDialog();

    await user.upload(fileInput(), csv('vendors.csv'));

    expect(await screen.findByText('vendors.csv')).toBeInTheDocument();
  });

  it('lists rows that need reading, and not the ones that do not', async () => {
    server.use(
      http.post(IMPORT, () =>
        HttpResponse.json(
          report({
            total_rows: 3,
            created: 1,
            skipped: 1,
            failed: 1,
            rows: [
              { row: 2, name: 'Acme Ortho', outcome: 'created' },
              { row: 3, name: 'Medline', outcome: 'skipped', code: 'already_exists' },
              { row: 4, name: '', outcome: 'failed', code: 'blank_name' },
            ],
          }),
        ),
      ),
    );
    const { user } = renderDialog();

    await user.upload(fileInput(), csv());

    // The failure is shown first — it is the only actionable row.
    const rows = await screen.findAllByRole('row');
    // Row 0 is the header; row 1 is the first body row.
    expect(rows.at(1)?.textContent).toContain('No name in this row');
    expect(screen.getByText('Already in your list')).toBeInTheDocument();
    // The created row is counted, not listed.
    expect(screen.queryByText('Acme Ortho')).not.toBeInTheDocument();
  });

  it('reports a file the server could not read, and offers nothing to commit', async () => {
    // A `.csv` the server cannot parse, not a `.txt`: the input's `accept`
    // keeps the wrong extension out of the picker entirely, so the case that
    // actually reaches the server is a file with the right name and the wrong
    // contents.
    server.use(
      http.post(IMPORT, () =>
        HttpResponse.json({ file: ['The file has no header row.'] }, { status: 400 }),
      ),
    );
    const { user } = renderDialog();

    await user.upload(fileInput(), csv());

    expect(await screen.findByText('The file has no header row.')).toBeInTheDocument();
    expect(importButton()).toBeDisabled();
  });
});

describe('committing', () => {
  it('sends the same file again with dry_run off', async () => {
    const { user } = renderDialog();
    await user.upload(fileInput(), csv());
    await screen.findByText('2 rows: 2 to add.');

    await user.click(importButton());

    await waitFor(() => expect(posted).toHaveLength(2));
    // The preview, then the commit. The file goes up a second time because
    // there is no server-side staging to refer back to.
    expect(flags()).toEqual(['true', 'false']);
  });

  it('switches from a promise to a report', async () => {
    const { user } = renderDialog();
    await user.upload(fileInput(), csv());
    await screen.findByText('2 rows: 2 to add.');

    await user.click(importButton());

    expect(await screen.findByText('2 rows: 2 added.')).toBeInTheDocument();
  });

  it('offers Done rather than Cancel once it has written', async () => {
    const { user } = renderDialog();
    await user.upload(fileInput(), csv());
    await screen.findByText('2 rows: 2 to add.');

    await user.click(importButton());

    expect(await screen.findByRole('button', { name: 'Done' })).toBeInTheDocument();
    // Nothing left to commit, so the button goes rather than inviting a re-run
    // that would report everything as already there.
    expect(screen.queryByRole('button', { name: /^Import/ })).not.toBeInTheDocument();
  });

  it('will not commit a file with nothing to add', async () => {
    server.use(
      http.post(IMPORT, () =>
        HttpResponse.json(
          report({
            created: 0,
            skipped: 2,
            rows: [
              { row: 2, name: 'Acme Ortho', outcome: 'skipped', code: 'already_exists' },
              { row: 3, name: 'Beta Devices', outcome: 'skipped', code: 'already_exists' },
            ],
          }),
        ),
      ),
    );
    const { user } = renderDialog();

    await user.upload(fileInput(), csv());

    const button = await screen.findByRole('button', { name: 'Nothing to import' });
    expect(button).toBeDisabled();
    // A re-run of an already-imported file is the case this covers: it reads
    // as "already there", not as an error.
    expect(await screen.findByText('2 rows: 2 already there.')).toBeInTheDocument();
  });

  it('does not send anything until asked', async () => {
    const { user } = renderDialog();

    await user.upload(fileInput(), csv());
    await screen.findByText('2 rows: 2 to add.');

    expect(flags()).toEqual(['true']);
  });
});
