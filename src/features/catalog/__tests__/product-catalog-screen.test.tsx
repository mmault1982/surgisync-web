import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PartList } from '@/api/generated/model';
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

function part(overrides: Partial<PartList> = {}): PartList {
  return {
    id: 1,
    uuid: 'aaaaaaaa-0000-0000-0000-000000000000',
    name: 'Lapidus Fixation Set',
    description: '',
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

beforeEach(() => {
  lastRequest = new URLSearchParams();
  server.use(
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
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <ProductCatalogScreen
        search={{ ...CATALOG_DEFAULTS, ...search }}
        onSearchChange={onSearchChange}
        onClearAll={onClearAll}
        onPageChange={onPageChange}
      />
    </QueryClientProvider>,
  );

  return { onSearchChange, onClearAll, onPageChange, user: userEvent.setup() };
}

describe('ProductCatalogScreen', () => {
  it('renders a row per catalog part with a count', async () => {
    renderScreen();

    expect(await screen.findByText('Lapidus Fixation Set')).toBeInTheDocument();
    expect(screen.getByText('1').closest('div')).toHaveTextContent('1 catalog parts');
    expect(screen.getByText('Treace Medical')).toBeInTheDocument();
  });

  it('labels a component by its description, since it has no name', async () => {
    // The whole reason `catalogLabel` exists — asserted here as well as in the
    // unit test, because it is the table wiring that can silently go back to
    // rendering `row.name`.
    server.use(
      http.get(PARTS, () =>
        HttpResponse.json(
          page([
            part({
              kind: 'component',
              name: null,
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
