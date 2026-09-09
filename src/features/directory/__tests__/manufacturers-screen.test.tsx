import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Manufacturer } from '@/api/generated/model';
import { server } from '@/test/msw/server';
import { renderWithRouter } from '@/test/router';

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

const MANUFACTURERS = '/api/v1/directory/manufacturers/';

function manufacturer(overrides: Partial<Manufacturer> = {}): Manufacturer {
  // Owned by default, so the write-control tests use rows the server would
  // accept a write on.
  return { id: 7, name: 'Acme Ortho', barcode: null, is_owned: true, ...overrides };
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
  const onAdd = vi.fn();
  const onOpen = vi.fn();
  const onEdit = vi.fn();
  // `renderWithRouter`, not a bare render: the Name cell is a real `<Link>`
  // now, and `<Link>` reads the router from context and throws without one.
  renderWithRouter(
    <QueryClientProvider client={client}>
      <ManufacturersScreen
        search={{ ...MANUFACTURER_DEFAULTS, ...search }}
        onSearchChange={onSearchChange}
        onPageChange={onPageChange}
        onAdd={onAdd}
        onOpen={onOpen}
        onEdit={onEdit}
      />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), onSearchChange, onPageChange, onAdd, onOpen, onEdit };
}

let deleted: string[];

beforeEach(() => {
  role = 'admin';
  deleted = [];
  server.use(
    http.get(MANUFACTURERS, () => HttpResponse.json(page([manufacturer()]))),
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

describe('what the screen promises', () => {
  it('says a manufacturer needs a catalog before stock can be received', async () => {
    // The surprise this exists to prevent: a manufacturer added here does not
    // appear on Receive / Load, because that picker asks for `has_items` and a
    // new one has no catalog parts. Discovering that by not finding it is the
    // worst way to learn it.
    renderScreen();

    expect(
      await screen.findByText(/needs its catalog of parts, which is loaded separately/i),
    ).toBeInTheDocument();
  });
});

/** The one cell in the row that carries nothing interactive of its own. */
function barcodeCell(): HTMLElement {
  return within(screen.getByRole('row', { name: /Acme Ortho/ })).getAllByRole('cell')[1]!;
}

describe('opening one', () => {
  // Add and Edit are pages now, so this screen's job is to say *which* — the
  // navigation itself lives in the route file, as it does for search and paging.
  it('hands Add to the route', async () => {
    const { user, onAdd } = renderScreen();
    await screen.findByText('Acme Ortho');

    await user.click(screen.getByRole('button', { name: 'Add manufacturer' }));

    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('hands the pencil to the route with the row id', async () => {
    const { user, onEdit } = renderScreen();
    await screen.findByText('Acme Ortho');

    await user.click(screen.getByRole('button', { name: 'Edit Acme Ortho' }));

    expect(onEdit).toHaveBeenCalledWith(7);
  });

  it('opens the record from a row click', async () => {
    const { user, onOpen } = renderScreen();
    await screen.findByText('Acme Ortho');

    // The Barcode cell, not the Name one: the anchor there owns its own click,
    // which is exactly what the row handler has to keep out of the way of.
    await user.click(barcodeCell());

    expect(onOpen).toHaveBeenCalledWith(7);
  });

  it('leaves the row click to the anchor when a modifier is held', async () => {
    const { user, onOpen } = renderScreen();
    await screen.findByText('Acme Ortho');

    await user.keyboard('{Meta>}');
    await user.click(barcodeCell());
    await user.keyboard('{/Meta}');

    // Navigating programmatically would swallow the modifier and open the
    // record in this tab, which is the one thing the user did not ask for.
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('does not open the record behind the Remove dialog', async () => {
    const { user, onOpen } = renderScreen();
    await screen.findByText('Acme Ortho');

    await user.click(screen.getByRole('button', { name: 'Remove Acme Ortho' }));

    await screen.findByRole('alertdialog');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('links the name to the record', async () => {
    renderScreen();

    expect(await screen.findByRole('link', { name: 'Acme Ortho' })).toHaveAttribute(
      'href',
      '/directory/manufacturers/7',
    );
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
    expect(screen.queryByRole('button', { name: 'Edit Acme Ortho' })).not.toBeInTheDocument();
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

describe('shared catalog rows', () => {
  it('offers no controls on a row the server would refuse', async () => {
    server.use(
      http.get(MANUFACTURERS, () =>
        HttpResponse.json(page([manufacturer({ name: 'Shared Vendor', is_owned: false })])),
      ),
    );
    renderScreen();
    await screen.findByText('Shared Vendor');

    expect(screen.queryByRole('button', { name: 'Edit Shared Vendor' })).not.toBeInTheDocument();
    expect(screen.getByText('Shared')).toBeInTheDocument();
  });
});
