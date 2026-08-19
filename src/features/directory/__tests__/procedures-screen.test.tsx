import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProcedureCatalog } from '@/api/generated/model';
import { server } from '@/test/msw/server';

import { ProceduresScreen } from '../components/procedures-screen';
import { PROCEDURE_DEFAULTS, type ProcedureSearch } from '../procedures.search';

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

const PROCEDURES = '/api/v1/procedures/';

let role: string | null = 'admin';
vi.mock('@/auth/auth-context', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'a@b.c', name: 'A', role, organization_name: null, organizations: [] },
  }),
}));

function procedure(overrides: Partial<ProcedureCatalog> = {}): ProcedureCatalog {
  // Owned by default: the fixtures that exercise the write controls need to
  // be rows the server would actually accept a write on.
  return { id: 7, name: 'Total Knee Arthroplasty', is_owned: true, ...overrides };
}

const page = (results: ProcedureCatalog[]) => ({
  total_data: results.length,
  current_page: 1,
  total_pages: 1,
  next: null,
  previous: null,
  results,
});

function renderScreen(search: Partial<ProcedureSearch> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onSearchChange = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ProceduresScreen
        search={{ ...PROCEDURE_DEFAULTS, ...search }}
        onSearchChange={onSearchChange}
        onPageChange={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), onSearchChange };
}

let created: unknown[];
let patched: { id: string; body: unknown }[];
let deleted: string[];

beforeEach(() => {
  role = 'admin';
  created = [];
  patched = [];
  deleted = [];
  server.use(
    http.get(PROCEDURES, () => HttpResponse.json(page([procedure()]))),
    http.post(PROCEDURES, async ({ request }) => {
      created.push(await request.json());
      return HttpResponse.json(procedure({ id: 99, name: 'Rotator Cuff Repair' }), { status: 201 });
    }),
    http.patch(`${PROCEDURES}:id/`, async ({ request, params }) => {
      patched.push({ id: String(params.id), body: await request.json() });
      return HttpResponse.json(procedure({ name: 'Renamed' }));
    }),
    http.delete(`${PROCEDURES}:id/`, ({ params }) => {
      deleted.push(String(params.id));
      return HttpResponse.json(procedure());
    }),
  );
});

describe('the table', () => {
  it('renders what the server returned', async () => {
    renderScreen();

    expect(await screen.findByText('Total Knee Arthroplasty')).toBeInTheDocument();
  });

  it('reads `results`', async () => {
    server.use(
      http.get(PROCEDURES, () =>
        HttpResponse.json({
          total_data: 1,
          current_page: 1,
          total_pages: 1,
          next: null,
          previous: null,
          results: [procedure({ name: 'From results' })],
        }),
      ),
    );
    renderScreen();

    expect(await screen.findByText('From results')).toBeInTheDocument();
  });

  it('says which empty state it is', async () => {
    server.use(http.get(PROCEDURES, () => HttpResponse.json(page([]))));
    renderScreen({ search: 'zzz' });

    expect(await screen.findByText('No procedures match that search')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument();
  });

  it('offers a retry when the list fails', async () => {
    server.use(http.get(PROCEDURES, () => HttpResponse.json({}, { status: 500 })));
    renderScreen();

    expect(await screen.findByText('Could not load procedures')).toBeInTheDocument();
  });
});

describe('writing', () => {
  it('posts just the trimmed name', async () => {
    const { user } = renderScreen();
    await screen.findByText('Total Knee Arthroplasty');

    await user.click(screen.getByRole('button', { name: 'Add procedure' }));
    await user.type(await screen.findByLabelText(/Name/), '  Rotator Cuff Repair  ');
    await user.click(screen.getByRole('button', { name: 'Add procedure' }));

    await waitFor(() => expect(created).toEqual([{ name: 'Rotator Cuff Repair' }]));
  });

  it('patches on rename', async () => {
    const { user } = renderScreen();
    await screen.findByText('Total Knee Arthroplasty');

    await user.click(screen.getByRole('button', { name: 'Rename Total Knee Arthroplasty' }));
    const field = await screen.findByLabelText(/Name/);
    await user.clear(field);
    await user.type(field, 'Total Knee Revision');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patched).toEqual([{ id: '7', body: { name: 'Total Knee Revision' } }]),
    );
  });

  it('shows a name clash under the field', async () => {
    server.use(
      http.post(PROCEDURES, () =>
        HttpResponse.json(
          { name: ['Your organization already has a procedure with this name.'] },
          { status: 400 },
        ),
      ),
    );
    const { user } = renderScreen();
    await screen.findByText('Total Knee Arthroplasty');

    await user.click(screen.getByRole('button', { name: 'Add procedure' }));
    await user.type(await screen.findByLabelText(/Name/), 'Total Knee Arthroplasty');
    await user.click(screen.getByRole('button', { name: 'Add procedure' }));

    expect(
      await screen.findByText('Your organization already has a procedure with this name.'),
    ).toBeInTheDocument();
  });
});

describe('removing', () => {
  it('asks first, then deletes', async () => {
    const { user } = renderScreen();
    await screen.findByText('Total Knee Arthroplasty');

    await user.click(screen.getByRole('button', { name: 'Remove Total Knee Arthroplasty' }));
    expect(await screen.findByText('Remove Total Knee Arthroplasty?')).toBeInTheDocument();
    expect(deleted).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(deleted).toEqual(['7']));
  });

  it('keeps the dialog open on a 409 so the counts can be read', async () => {
    // The case that matters most for procedures: the foreign keys cascade, so
    // the server refusing is the only thing standing between a delete and a
    // pile of destroyed cases.
    server.use(
      http.delete(`${PROCEDURES}:id/`, () =>
        HttpResponse.json(
          {
            error: 'procedure_in_use',
            message:
              'Total Knee Arthroplasty is used by 3 cases and 1 quote and cannot be removed.',
          },
          { status: 409 },
        ),
      ),
    );
    const { user } = renderScreen();
    await screen.findByText('Total Knee Arthroplasty');

    await user.click(screen.getByRole('button', { name: 'Remove Total Knee Arthroplasty' }));
    await user.click(await screen.findByRole('button', { name: 'Remove' }));

    expect(
      await screen.findByText(
        'Total Knee Arthroplasty is used by 3 cases and 1 quote and cannot be removed.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Remove Total Knee Arthroplasty?')).toBeInTheDocument();
  });
});

describe('who may write', () => {
  it('offers nothing to a rep', async () => {
    role = 'non_admin';
    renderScreen();
    await screen.findByText('Total Knee Arthroplasty');

    expect(screen.queryByRole('button', { name: 'Add procedure' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Import' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument();
  });

  it('still lets a rep read the list', async () => {
    role = 'non_admin';
    renderScreen();

    expect(await screen.findByText('Total Knee Arthroplasty')).toBeInTheDocument();
  });
});

describe('shared catalog rows', () => {
  it('offers no controls on a row the server would refuse', async () => {
    // The bug this exists for: every seeded procedure is shared, so the
    // screen shipped with 68 Rename buttons that all answered "Something went
    // wrong".
    server.use(
      http.get(PROCEDURES, () =>
        HttpResponse.json(page([procedure({ name: 'Seeded Procedure', is_owned: false })])),
      ),
    );
    renderScreen();
    await screen.findByText('Seeded Procedure');

    expect(
      screen.queryByRole('button', { name: 'Rename Seeded Procedure' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Remove Seeded Procedure' }),
    ).not.toBeInTheDocument();
    // Says why the row has none, rather than leaving an unexplained gap.
    expect(screen.getByText('Shared')).toBeInTheDocument();
  });

  it('still offers them on an owned row', async () => {
    renderScreen();
    await screen.findByText('Total Knee Arthroplasty');

    expect(
      screen.getByRole('button', { name: 'Rename Total Knee Arthroplasty' }),
    ).toBeInTheDocument();
  });
});

describe('a name already in the shared catalog', () => {
  it('is reported as a duplicate rather than added', async () => {
    // The server refuses it: the organization can already see that row, so
    // owning a second one would show the name twice in this list with nothing
    // to tell them apart.
    server.use(
      http.post(PROCEDURES, () =>
        HttpResponse.json(
          {
            name: ['A procedure with this name is already available to your organization.'],
          },
          { status: 400 },
        ),
      ),
    );
    const { user } = renderScreen();
    await screen.findByText('Total Knee Arthroplasty');

    await user.click(screen.getByRole('button', { name: 'Add procedure' }));
    await user.type(await screen.findByLabelText(/Name/), 'Akin Osteotomy');
    await user.click(screen.getByRole('button', { name: 'Add procedure' }));

    expect(
      await screen.findByText(
        'A procedure with this name is already available to your organization.',
      ),
    ).toBeInTheDocument();
    // Still open, so the name that failed can be corrected.
    expect(screen.getByLabelText(/Name/)).toBeInTheDocument();
  });
});
