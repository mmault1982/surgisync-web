import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Manufacturer } from '@/api/generated/model';
import { server } from '@/test/msw/server';

import { ManufacturersScreen } from '../components/manufacturers-screen';
import { MANUFACTURER_DEFAULTS, type ManufacturerSearch } from '../manufacturers.search';

beforeAll(() => {
  // Radix measures its trigger and calls pointer-capture methods on open;
  // jsdom implements neither. Copied from receive-sku-form.test.tsx.
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

const MANUFACTURERS = '/api/v1/manufacturers/';

function manufacturer(overrides: Partial<Manufacturer> = {}): Manufacturer {
  return { id: 7, name: 'Acme Ortho', barcode: null, ...overrides };
}

const page = (results: Manufacturer[]) => ({
  total_data: results.length,
  current_page: 1,
  total_pages: 1,
  next: null,
  previous: null,
  results,
});

// The screen reads the signed-in user's role to decide whether to offer the
// write controls. Mocked rather than driven through a real auth store: the
// store is module-scope with a single-flight refresh, and standing one up here
// would test it rather than this screen.
let role: string | null = 'admin';
vi.mock('@/auth/auth-context', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'a@b.c', name: 'A', role, organization_name: null, organizations: [] },
  }),
}));

function renderScreen(search: Partial<ManufacturerSearch> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onSearchChange = vi.fn();
  const onPageChange = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ManufacturersScreen
        search={{ ...MANUFACTURER_DEFAULTS, ...search }}
        onSearchChange={onSearchChange}
        onPageChange={onPageChange}
      />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), onSearchChange, onPageChange };
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
    http.get(MANUFACTURERS, () => HttpResponse.json(page([manufacturer()]))),
    http.post(MANUFACTURERS, async ({ request }) => {
      created.push(await request.json());
      return HttpResponse.json(manufacturer({ id: 99, name: 'Beta Devices' }), { status: 201 });
    }),
    http.patch(`${MANUFACTURERS}:id/`, async ({ request, params }) => {
      patched.push({ id: String(params.id), body: await request.json() });
      return HttpResponse.json(manufacturer({ name: 'Renamed' }));
    }),
    http.delete(`${MANUFACTURERS}:id/`, ({ params }) => {
      deleted.push(String(params.id));
      return HttpResponse.json(manufacturer());
    }),
  );
});

describe('the table', () => {
  it('renders what the server returned', async () => {
    renderScreen();

    expect(await screen.findByText('Acme Ortho')).toBeInTheDocument();
    expect(screen.getByText('1', { selector: 'strong' })).toBeInTheDocument();
  });

  it('says which empty state it is', async () => {
    server.use(http.get(MANUFACTURERS, () => HttpResponse.json(page([]))));
    renderScreen({ search: 'zzz' });

    // The searched case offers the way out; the never-populated case does not,
    // because there would be nothing to clear.
    expect(await screen.findByText('No manufacturers match that search')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument();
  });

  it('offers no way out when nothing is filtered', async () => {
    server.use(http.get(MANUFACTURERS, () => HttpResponse.json(page([]))));
    renderScreen();

    expect(await screen.findByText('No manufacturers yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
  });

  it('offers a retry when the list fails', async () => {
    server.use(http.get(MANUFACTURERS, () => HttpResponse.json({}, { status: 500 })));
    renderScreen();

    expect(await screen.findByText('Could not load manufacturers')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('reads `results`, never the deprecated `data` that duplicates it', async () => {
    // A screen built on `data` would break with no type error, and that key is
    // there only for shipped Flutter builds.
    server.use(
      http.get(MANUFACTURERS, () =>
        HttpResponse.json({
          total_data: 1,
          current_page: 1,
          total_pages: 1,
          next: null,
          previous: null,
          results: [manufacturer({ name: 'From results' })],
        }),
      ),
    );
    renderScreen();

    expect(await screen.findByText('From results')).toBeInTheDocument();
  });
});

describe('adding one', () => {
  it('posts just the trimmed name', async () => {
    const { user } = renderScreen();
    await screen.findByText('Acme Ortho');

    await user.click(screen.getByRole('button', { name: 'Add manufacturer' }));
    await user.type(await screen.findByLabelText(/Name/), '  Beta Devices  ');
    await user.click(screen.getByRole('button', { name: 'Add manufacturer' }));

    await waitFor(() => expect(created).toEqual([{ name: 'Beta Devices' }]));
  });

  it('sends nothing when the name is blank', async () => {
    const { user } = renderScreen();
    await screen.findByText('Acme Ortho');

    await user.click(screen.getByRole('button', { name: 'Add manufacturer' }));
    await screen.findByLabelText(/Name/);
    await user.click(screen.getByRole('button', { name: 'Add manufacturer' }));

    expect(await screen.findByText('Enter a name.')).toBeInTheDocument();
    expect(created).toEqual([]);
  });

  it('shows a name clash under the field, not as a form-level alert', async () => {
    server.use(
      http.post(MANUFACTURERS, () =>
        HttpResponse.json(
          { name: ['Your organization already has a manufacturer with this name.'] },
          { status: 400 },
        ),
      ),
    );
    const { user } = renderScreen();
    await screen.findByText('Acme Ortho');

    await user.click(screen.getByRole('button', { name: 'Add manufacturer' }));
    await user.type(await screen.findByLabelText(/Name/), 'Acme Ortho');
    await user.click(screen.getByRole('button', { name: 'Add manufacturer' }));

    expect(
      await screen.findByText('Your organization already has a manufacturer with this name.'),
    ).toBeInTheDocument();
    // Still open, so the user can fix the value that failed.
    expect(screen.getByLabelText(/Name/)).toBeInTheDocument();
  });
});

describe('renaming one', () => {
  it('patches the row', async () => {
    const { user } = renderScreen();
    await screen.findByText('Acme Ortho');

    await user.click(screen.getByRole('button', { name: 'Rename Acme Ortho' }));
    const field = await screen.findByLabelText(/Name/);
    await user.clear(field);
    await user.type(field, 'Acme Orthopaedics');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patched).toEqual([{ id: '7', body: { name: 'Acme Orthopaedics' } }]),
    );
  });

  it('sends nothing when the name has not changed', async () => {
    const { user } = renderScreen();
    await screen.findByText('Acme Ortho');

    await user.click(screen.getByRole('button', { name: 'Rename Acme Ortho' }));
    await screen.findByLabelText(/Name/);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByLabelText(/Name/)).not.toBeInTheDocument());
    expect(patched).toEqual([]);
  });
});

describe('removing one', () => {
  it('asks first, then deletes', async () => {
    const { user } = renderScreen();
    await screen.findByText('Acme Ortho');

    await user.click(screen.getByRole('button', { name: 'Remove Acme Ortho' }));
    expect(await screen.findByText('Remove Acme Ortho?')).toBeInTheDocument();
    expect(deleted).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(deleted).toEqual(['7']));
  });

  it('keeps the dialog open on a 409 so the reason can be read', async () => {
    // The case the database cannot catch: Part.manufacturer is PROTECT, but a
    // soft delete never trips a foreign key, so the server refuses and its
    // message carries the count.
    server.use(
      http.delete(`${MANUFACTURERS}:id/`, () =>
        HttpResponse.json(
          {
            error: 'manufacturer_in_use',
            message: 'Acme Ortho still has 12 catalog parts and cannot be removed.',
          },
          { status: 409 },
        ),
      ),
    );
    const { user } = renderScreen();
    await screen.findByText('Acme Ortho');

    await user.click(screen.getByRole('button', { name: 'Remove Acme Ortho' }));
    await user.click(await screen.findByRole('button', { name: 'Remove' }));

    expect(
      await screen.findByText('Acme Ortho still has 12 catalog parts and cannot be removed.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Remove Acme Ortho?')).toBeInTheDocument();
  });

  it('does not promise a permanent delete, because it is a soft one', async () => {
    const { user } = renderScreen();
    await screen.findByText('Acme Ortho');

    await user.click(screen.getByRole('button', { name: 'Remove Acme Ortho' }));
    const dialog = await screen.findByRole('alertdialog');

    expect(dialog.textContent).not.toMatch(/permanent/i);
  });
});

describe('who may write', () => {
  it('offers nothing to a rep', async () => {
    // The seeded e2e user is exactly this: role `non_admin`, no superuser
    // flag. Every write 403s server-side, so the controls must not be there
    // to click — learning on submit is the worst moment.
    role = 'non_admin';
    renderScreen();
    await screen.findByText('Acme Ortho');

    expect(screen.queryByRole('button', { name: 'Add manufacturer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rename Acme Ortho' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove Acme Ortho' })).not.toBeInTheDocument();
    // The whole column goes, rather than a header over empty cells.
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument();
  });

  it('still lets a rep read the list', async () => {
    role = 'non_admin';
    renderScreen();

    expect(await screen.findByText('Acme Ortho')).toBeInTheDocument();
  });

  it('does not invite a rep to add one from the empty state', async () => {
    role = 'non_admin';
    server.use(http.get(MANUFACTURERS, () => HttpResponse.json(page([]))));
    renderScreen();

    expect(await screen.findByText('No manufacturers yet')).toBeInTheDocument();
    expect(
      screen.getByText('An administrator can add one for your organization.'),
    ).toBeInTheDocument();
  });
});
