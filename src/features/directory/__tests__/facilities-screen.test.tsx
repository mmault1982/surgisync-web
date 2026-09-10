import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FacilityCatalog } from '@/api/generated/model';
import { server } from '@/test/msw/server';
import { renderWithRouter } from '@/test/router';

import { FacilitiesScreen } from '../components/facilities-screen';
import { FACILITY_DEFAULTS, type FacilitySearch } from '../facilities.search';

import { facilityCatalogFixture } from './facility-fixture';

beforeAll(() => {
  // Radix measures its trigger and calls pointer-capture methods on open;
  // jsdom implements neither. Copied from manufacturers-screen.test.tsx — this
  // screen has four Selects and an AlertDialog.
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

const FACILITIES = '/api/v1/directory/facilities/';
const FACILITY = '/api/v1/directory/facilities/:id/';

const page = (results: FacilityCatalog[]) => ({
  total_data: results.length,
  current_page: 1,
  total_pages: 1,
  next: null,
  previous: null,
  results,
});

let listed: URLSearchParams[];
let deleted: string[];
let patched: { id: string; body: unknown }[];

function serveList(results: FacilityCatalog[] = [facilityCatalogFixture()]) {
  server.use(
    http.get(FACILITIES, ({ request }) => {
      listed.push(new URL(request.url).searchParams);
      return HttpResponse.json(page(results));
    }),
  );
}

beforeEach(() => {
  listed = [];
  deleted = [];
  patched = [];
  server.use(
    http.delete(FACILITY, ({ params }) => {
      deleted.push(String(params.id));
      return HttpResponse.json(facilityCatalogFixture({ is_active: false }));
    }),
    http.patch(FACILITY, async ({ request, params }) => {
      patched.push({ id: String(params.id), body: await request.json() });
      return HttpResponse.json(facilityCatalogFixture({ is_active: true }));
    }),
  );
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

function renderScreen(search: Partial<FacilitySearch> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onSearchChange = vi.fn();
  const onPageChange = vi.fn();
  const onAdd = vi.fn();
  const onOpen = vi.fn();
  const onEdit = vi.fn();
  // `renderWithRouter`, not a bare render: the Name cell is a real `<Link>`,
  // and `<Link>` reads the router from context and throws without one.
  renderWithRouter(
    <QueryClientProvider client={client}>
      <FacilitiesScreen
        search={{ ...FACILITY_DEFAULTS, ...search }}
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

beforeEach(() => {
  role = 'admin';
});

describe('the table', () => {
  it('renders what the server sent', async () => {
    serveList([
      facilityCatalogFixture(),
      facilityCatalogFixture({
        id: 42,
        name: 'Northside Surgery',
        facility_type: 'surgery_center',
      }),
    ]);
    renderScreen();

    expect(await screen.findByRole('link', { name: 'Mercy General Hospital' })).toBeInTheDocument();
    // The model's own label, not a title-cased enum value.
    expect(screen.getByText('Ambulatory Surgery Center')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('links each name at its own record', async () => {
    serveList();
    renderScreen();

    expect(await screen.findByRole('link', { name: 'Mercy General Hospital' })).toHaveAttribute(
      'href',
      '/directory/facilities/41',
    );
  });

  it('marks a deactivated row without hiding it', async () => {
    // The endpoint returns both states by default, deliberately — this catalog
    // exists to show and undo a deactivation, not to hide it.
    serveList([facilityCatalogFixture({ is_active: false })]);
    renderScreen();

    expect(await screen.findByText('Deactivated')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mercy General Hospital' })).toBeInTheDocument();
  });

  it('opens a record on a row click', async () => {
    serveList();
    const { user, onOpen } = renderScreen();

    await user.click(await screen.findByText('Hospital'));

    expect(onOpen).toHaveBeenCalledWith(41);
  });
});

describe('narrowing the list', () => {
  it('sends the search term to the server', async () => {
    serveList();
    renderScreen({ search: 'mercy' });

    await waitFor(() => expect(listed).toHaveLength(1));
    expect(listed.map((params) => params.get('search'))).toEqual(['mercy']);
  });

  it('patches the search on the type filter', async () => {
    serveList();
    const { user, onSearchChange } = renderScreen();
    await screen.findByRole('link', { name: 'Mercy General Hospital' });

    await user.click(screen.getByRole('combobox', { name: 'Filter by type' }));
    await user.click(await screen.findByRole('option', { name: 'Clinic' }));

    expect(onSearchChange).toHaveBeenCalledWith({ facility_type: 'clinic' });
  });

  it('says nothing about onboarding status anywhere', async () => {
    // The contract has it and every row carries one; this app neither shows
    // it, filters on it, nor writes it.
    serveList([facilityCatalogFixture({ onboarding_status: 'completed' })]);
    renderScreen();

    await screen.findByRole('link', { name: 'Mercy General Hospital' });
    expect(screen.queryByRole('combobox', { name: /onboarding/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /onboarding/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
  });

  it('shows the columns it does keep', async () => {
    serveList();
    renderScreen();

    await screen.findByRole('link', { name: 'Mercy General Hospital' });
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Name',
      'Type',
      'Actions',
    ]);
  });

  it('offers all three states, and asks for the deactivated ones with false', async () => {
    serveList();
    const { user, onSearchChange } = renderScreen();
    await screen.findByRole('link', { name: 'Mercy General Hospital' });

    await user.click(screen.getByRole('combobox', { name: 'Filter by state' }));
    await user.click(await screen.findByRole('option', { name: 'Deactivated only' }));

    expect(onSearchChange).toHaveBeenCalledWith({ is_active: false });
  });

  it('clears every filter from the empty state', async () => {
    serveList([]);
    const { user, onSearchChange } = renderScreen({ search: 'nothing', facility_type: 'clinic' });

    await user.click(await screen.findByRole('button', { name: 'Clear filters' }));

    expect(onSearchChange).toHaveBeenCalledWith({
      search: undefined,
      facility_type: undefined,
      is_active: undefined,
    });
  });

  it('says which empty it is', async () => {
    serveList([]);
    renderScreen();

    expect(await screen.findByText('No facilities yet')).toBeInTheDocument();
  });
});

describe('standing one down', () => {
  it('says deactivate, and never promises a delete', async () => {
    serveList();
    const { user } = renderScreen();

    await user.click(
      await screen.findByRole('button', { name: 'Deactivate Mercy General Hospital' }),
    );

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Deactivate Mercy General Hospital?')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Deactivate' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    // The two facts a user cannot learn anywhere else: it is reversible, and
    // the name is not freed.
    expect(dialog).toHaveTextContent(/keeps its name/);
    expect(dialog).toHaveTextContent(/reactivate/i);
  });

  it('sends the DELETE on confirm', async () => {
    serveList();
    const { user } = renderScreen();

    await user.click(
      await screen.findByRole('button', { name: 'Deactivate Mercy General Hospital' }),
    );
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Deactivate' }),
    );

    await waitFor(() => expect(deleted).toEqual(['41']));
  });
});

describe('bringing one back', () => {
  it('offers Reactivate instead of Deactivate on a stood-down row', async () => {
    serveList([facilityCatalogFixture({ is_active: false })]);
    renderScreen();

    expect(
      await screen.findByRole('button', { name: 'Reactivate Mercy General Hospital' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Deactivate Mercy General Hospital' }),
    ).not.toBeInTheDocument();
  });

  it('patches is_active true, with no confirmation to sit through', async () => {
    serveList([facilityCatalogFixture({ is_active: false })]);
    const { user } = renderScreen();

    await user.click(
      await screen.findByRole('button', { name: 'Reactivate Mercy General Hospital' }),
    );

    // The body is asserted, not just the call: an accidental `false` here
    // would be both catastrophic and invisible.
    await waitFor(() => expect(patched).toEqual([{ id: '41', body: { is_active: true } }]));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('says so when it fails, since there is no dialog to hold the message', async () => {
    serveList([facilityCatalogFixture({ is_active: false })]);
    server.use(http.patch(FACILITY, () => HttpResponse.json({}, { status: 500 })));
    const { user } = renderScreen();

    await user.click(
      await screen.findByRole('button', { name: 'Reactivate Mercy General Hospital' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reactivate/i);
  });
});

describe('who may write', () => {
  it('offers an admin the controls', async () => {
    serveList();
    renderScreen();

    // The row first: `Add facility` is in the header and renders before the
    // list query resolves, so awaiting it would not mean the table is there.
    expect(await screen.findByRole('link', { name: 'Mercy General Hospital' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add facility' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Mercy General Hospital' })).toBeInTheDocument();
  });

  it('offers a rep none of them, but still shows the list', async () => {
    role = 'sales_rep';
    serveList();
    renderScreen();

    expect(await screen.findByRole('link', { name: 'Mercy General Hospital' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add facility' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument();
  });

  it('offers no row controls on a facility this organization does not own', async () => {
    serveList([facilityCatalogFixture({ is_owned: false })]);
    renderScreen();

    expect(await screen.findByText('Read only')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit Mercy General Hospital' }),
    ).not.toBeInTheDocument();
  });

  it('offers no Import button, because there is no endpoint behind one', async () => {
    serveList();
    renderScreen();

    await screen.findByRole('link', { name: 'Mercy General Hospital' });
    expect(screen.queryByRole('button', { name: /import/i })).not.toBeInTheDocument();
  });
});
