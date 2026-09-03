import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PartList } from '@/api/generated/model';
import { renderWithRouter } from '@/test/router';
import { server } from '@/test/msw/server';

import { CATALOG_DEFAULTS, type CatalogSearch } from '../catalog.search';
import { ProductCatalogScreen } from '../components/product-catalog-screen';

beforeAll(() => {
  // Radix measures its trigger and calls pointer-capture methods on open;
  // jsdom implements neither. The column menus mount inside this screen.
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

const PARTS = '/api/v1/parts/';
const FACETS = '/api/v1/parts/manufacturers/';
const PARTS_IMPORT = '/api/v1/parts/import/';
const BOM_IMPORT = '/api/v1/parts/components/import/';

let role: string | null = 'admin';
vi.mock('@/auth/auth-context', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'a@b.c', name: 'A', role, organization_name: null, organizations: [] },
  }),
}));

function part(overrides: Partial<PartList> = {}): PartList {
  return {
    id: 1,
    uuid: 'aaaaaaaa-0000-0000-0000-000000000000',
    // Both, mirroring the wire: `name` is a deprecated read-only alias of
    // `description` since the label fold. Only `description` is read.
    name: 'Lapidus Fixation Set',
    description: 'Lapidus Fixation Set',
    kind: 'kit',
    reference_number: null,
    is_serialized: true,
    manufacturer: 9,
    manufacturer_name: 'Treace Medical',
    ...overrides,
  };
}

const page = (results: PartList[]) => ({
  total_data: results.length,
  current_page: 1,
  total_pages: 1,
  next: null,
  previous: null,
  results,
});

/** The query params the screen actually sent, for the request-shape tests. */
let lastRequest: URLSearchParams;
/** The ids the screen actually asked the server to remove. */
let deleted: string[];

beforeEach(() => {
  role = 'admin';
  lastRequest = new URLSearchParams();
  deleted = [];
  server.use(
    http.delete(`${PARTS}:id/`, ({ params }) => {
      deleted.push(String(params.id));
      return HttpResponse.json(part());
    }),
    http.get(PARTS, ({ request }) => {
      lastRequest = new URL(request.url).searchParams;
      return HttpResponse.json(page([part()]));
    }),
    http.get(FACETS, () => HttpResponse.json({ results: [{ id: 9, name: 'Treace Medical' }] })),
  );
});

function renderScreen(search: Partial<CatalogSearch> = {}) {
  const onSearchChange = vi.fn();
  const onClearAll = vi.fn();
  const onPageChange = vi.fn();
  const onAdd = vi.fn();
  const onOpenRow = vi.fn();
  const onEdit = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  // Through a stub router: the table's Name cell is a real `<Link>`, which
  // reads the router from context. See `src/test/router.tsx`.
  renderWithRouter(
    <QueryClientProvider client={client}>
      <ProductCatalogScreen
        search={{ ...CATALOG_DEFAULTS, ...search }}
        onSearchChange={onSearchChange}
        onClearAll={onClearAll}
        onPageChange={onPageChange}
        onAdd={onAdd}
        onOpenRow={onOpenRow}
        onEdit={onEdit}
      />
    </QueryClientProvider>,
  );

  return {
    onSearchChange,
    onClearAll,
    onPageChange,
    onAdd,
    onOpenRow,
    onEdit,
    user: userEvent.setup(),
  };
}

describe('ProductCatalogScreen', () => {
  it('renders a row per catalog part with a count', async () => {
    renderScreen();

    expect(await screen.findByText('Lapidus Fixation Set')).toBeInTheDocument();
    expect(screen.getByText('1').closest('div')).toHaveTextContent('1 catalog parts');
    expect(screen.getByText('Treace Medical')).toBeInTheDocument();
  });

  it('labels a component by its description', async () => {
    // The whole reason `catalogLabel` exists — asserted here as well as in the
    // unit test, because it is the table wiring that can silently go back to
    // rendering `row.name`, which is now the deprecated alias.
    server.use(
      http.get(PARTS, () =>
        HttpResponse.json(
          page([
            part({
              kind: 'component',
              description: 'REAMER CANNULATED ACORN 4.5MM',
              reference_number: 'RC-4500',
            }),
          ]),
        ),
      ),
    );
    renderScreen();

    expect(await screen.findByText('REAMER CANNULATED ACORN 4.5MM')).toBeInTheDocument();
    expect(screen.getByText('RC-4500')).toBeInTheDocument();
  });

  it('shows an em dash where a kit has no reference number', async () => {
    // Kits never carry one, so this is "not applicable", not "missing".
    renderScreen();

    const row = (await screen.findByText('Lapidus Fixation Set')).closest('tr');
    expect(within(row!).getByText('—')).toBeInTheDocument();
    expect(within(row!).getByText('Kit')).toBeInTheDocument();
  });

  it('sends the search term to the server rather than filtering locally', async () => {
    // The catalog is thousands of rows against a 1000-row max page, so client
    // filtering would silently only ever search the page in view.
    const { user, onSearchChange } = renderScreen();

    await screen.findByText('Lapidus Fixation Set');
    await user.type(screen.getByRole('searchbox', { name: 'Search catalog' }), 'reamer');

    expect(onSearchChange).toHaveBeenLastCalledWith({ search: 'reamer' });
  });

  it('clears the search param rather than sending an empty string', async () => {
    const { user, onSearchChange } = renderScreen({ search: 'reamer' });

    await screen.findByText('Lapidus Fixation Set');
    await user.clear(screen.getByRole('searchbox', { name: 'Search catalog' }));

    expect(onSearchChange).toHaveBeenLastCalledWith({ search: undefined });
  });

  it('passes the filters through as query parameters', async () => {
    renderScreen({ manufacturer_id: [5, 9], kind: 'component', ordering: '-name' });

    await waitFor(() => expect(lastRequest.get('kind')).toBe('component'));
    // Repeated bare keys, which is what the server's getlist() reads. A
    // `manufacturer_id[]` spelling reaches it as nothing and silently returns
    // the unfiltered catalog.
    expect(lastRequest.getAll('manufacturer_id')).toEqual(['5', '9']);
    expect(lastRequest.get('ordering')).toBe('-name');
  });

  it('offers a way out of an empty filtered result', async () => {
    server.use(http.get(PARTS, () => HttpResponse.json(page([]))));
    const { user, onClearAll } = renderScreen({ search: 'nothing matches this' });

    await user.click(await screen.findByRole('button', { name: 'Clear all filters' }));

    expect(onClearAll).toHaveBeenCalled();
  });

  it('distinguishes an empty catalog from an empty filter result', async () => {
    // Different causes, different next actions — and only one of them is the
    // user's to fix, so offering "clear all filters" here would be a dead end.
    server.use(http.get(PARTS, () => HttpResponse.json(page([]))));
    renderScreen();

    expect(await screen.findByText('No catalog parts yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear all filters' })).not.toBeInTheDocument();
  });

  it('shows the active filters as dismissable chips', async () => {
    const { user, onSearchChange } = renderScreen({ manufacturer_id: [9], kind: 'kit' });

    await screen.findByText('Lapidus Fixation Set');
    expect(screen.getByText('Manufacturer: 1 selected')).toBeInTheDocument();
    // Kind is scalar, so the chip names the value rather than counting it.
    expect(screen.getByText('Kind: kit')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove filter Kind: kit' }));

    expect(onSearchChange).toHaveBeenCalledWith({ kind: undefined });
  });

  it('shows no chip row when nothing is filtered', async () => {
    renderScreen();

    await screen.findByText('Lapidus Fixation Set');
    expect(screen.queryByText('Active filters')).not.toBeInTheDocument();
  });

  it('offers a retry when the request fails', async () => {
    server.use(http.get(PARTS, () => HttpResponse.error()));
    renderScreen();

    expect(await screen.findByText('Could not load the catalog')).toBeInTheDocument();
  });
});

describe('who may write', () => {
  it('offers Add product and the Actions column to an admin', async () => {
    renderScreen();
    await screen.findByText('Lapidus Fixation Set');

    expect(screen.getByRole('button', { name: 'Add product' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
  });

  it('offers neither to a rep', async () => {
    // Whole controls, not disabled ones: a control nobody can use is noise,
    // and the server gates every write regardless.
    role = 'non_admin';
    renderScreen();
    await screen.findByText('Lapidus Fixation Set');

    expect(screen.queryByRole('button', { name: 'Add product' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument();
  });

  it('still lets a rep read the catalog', async () => {
    role = 'non_admin';
    renderScreen();

    expect(await screen.findByText('Lapidus Fixation Set')).toBeInTheDocument();
  });

  it('offers both import buttons to an admin', async () => {
    renderScreen();
    await screen.findByText('Lapidus Fixation Set');

    expect(screen.getByRole('button', { name: 'Import parts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import BOM' })).toBeInTheDocument();
  });

  it('offers neither import to a rep', async () => {
    role = 'non_admin';
    renderScreen();
    await screen.findByText('Lapidus Fixation Set');

    expect(screen.queryByRole('button', { name: 'Import parts' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Import BOM' })).not.toBeInTheDocument();
  });

  it('hands Add product to the route', async () => {
    const { onAdd, user } = renderScreen();
    await screen.findByText('Lapidus Fixation Set');

    await user.click(screen.getByRole('button', { name: 'Add product' }));

    expect(onAdd).toHaveBeenCalledOnce();
  });

  it('offers Add product from the empty state too', async () => {
    server.use(http.get(PARTS, () => HttpResponse.json(page([]))));
    const { onAdd, user } = renderScreen();

    await user.click(await screen.findByRole('button', { name: 'Add product' }));

    expect(onAdd).toHaveBeenCalledOnce();
  });

  it('does not offer it from the empty state to a rep', async () => {
    role = 'non_admin';
    server.use(http.get(PARTS, () => HttpResponse.json(page([]))));
    renderScreen();

    expect(await screen.findByText('No catalog parts yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add product' })).not.toBeInTheDocument();
  });
});

describe('removing a part', () => {
  it('asks first, then deletes', async () => {
    const { user } = renderScreen();
    await screen.findByText('Lapidus Fixation Set');

    await user.click(screen.getByRole('button', { name: 'Remove Lapidus Fixation Set' }));
    expect(await screen.findByText('Remove Lapidus Fixation Set?')).toBeInTheDocument();
    expect(deleted).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(deleted).toEqual(['1']));
  });

  it('keeps the dialog open on a 409 so the reason can be read', async () => {
    // The case that matters: `StockItem.part` is PROTECTed but the delete is
    // soft, so the server refusing is the only thing between the user and a
    // part that vanishes from every picker while stock still points at it.
    server.use(
      http.delete(`${PARTS}:id/`, () =>
        HttpResponse.json(
          {
            error: 'part_in_use',
            message: 'Lapidus Fixation Set is held by 3 stock items and cannot be removed.',
          },
          { status: 409 },
        ),
      ),
    );
    const { user } = renderScreen();
    await screen.findByText('Lapidus Fixation Set');

    await user.click(screen.getByRole('button', { name: 'Remove Lapidus Fixation Set' }));
    await user.click(await screen.findByRole('button', { name: 'Remove' }));

    expect(
      await screen.findByText(
        'Lapidus Fixation Set is held by 3 stock items and cannot be removed.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Remove Lapidus Fixation Set?')).toBeInTheDocument();
  });

  it('hands Edit to the route rather than opening a dialog', async () => {
    const { onEdit, user } = renderScreen();
    await screen.findByText('Lapidus Fixation Set');

    await user.click(screen.getByRole('button', { name: 'Edit Lapidus Fixation Set' }));

    expect(onEdit).toHaveBeenCalledWith(1);
  });
});

describe('importing a catalog', () => {
  it('opens the parts dialog, which says manufacturers must already exist', async () => {
    const { user } = renderScreen();
    await screen.findByText('Lapidus Fixation Set');

    await user.click(screen.getByRole('button', { name: 'Import parts' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Import parts')).toBeInTheDocument();
    expect(within(dialog).getByText(/must already exist/)).toBeInTheDocument();
  });

  it('opens the BOM dialog, which says to import the parts first', async () => {
    // The one thing a user gets wrong: a BOM file binds parts that already
    // exist and creates none, so uploading it first fails every row.
    const { user } = renderScreen();
    await screen.findByText('Lapidus Fixation Set');

    await user.click(screen.getByRole('button', { name: 'Import BOM' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Import the parts first/)).toBeInTheDocument();
  });

  it('opens one dialog at a time', async () => {
    const { user } = renderScreen();
    await screen.findByText('Lapidus Fixation Set');

    await user.click(screen.getByRole('button', { name: 'Import BOM' }));
    await screen.findByRole('dialog');

    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it.each([
    ['Import parts', PARTS_IMPORT],
    ['Import BOM', BOM_IMPORT],
  ])('%s posts to its own endpoint and refreshes the list', async (button, endpoint) => {
    // The wiring no other test reaches: that each dialog is pointed at the
    // right endpoint, and that a commit invalidates the list behind it. Without
    // the invalidation the imported rows are on the server and not on screen
    // until something else happens to refetch.
    const posted: string[] = [];
    let listed = 0;
    server.use(
      http.get(PARTS, () => {
        listed += 1;
        return HttpResponse.json(page([part()]));
      }),
      http.post(endpoint, async ({ request }) => {
        posted.push(request.url);
        const body = await request.text();
        return HttpResponse.json({
          dry_run: body.includes('true'),
          total_rows: 1,
          created: 1,
          updated: 0,
          skipped: 0,
          failed: 0,
          rows: [{ row: 2, name: 'A-1', outcome: 'created' }],
        });
      }),
    );

    const { user } = renderScreen();
    await screen.findByText('Lapidus Fixation Set');
    const before = listed;

    await user.click(screen.getByRole('button', { name: button }));
    const dialog = await screen.findByRole('dialog');
    await user.upload(
      within(dialog).getByLabelText(/Choose a .csv or .xlsx file/),
      new File(['manufacturer\nAcme\n'], 'catalog.csv', { type: 'text/csv' }),
    );

    // The preview, then the commit — both to the same endpoint.
    await screen.findByText('1 rows: 1 to add.');
    await user.click(within(dialog).getByRole('button', { name: 'Import 1' }));

    await waitFor(() => expect(listed).toBeGreaterThan(before));
    expect(posted).toHaveLength(2);
    expect(posted.every((url) => url.includes(endpoint))).toBe(true);
  });
});
