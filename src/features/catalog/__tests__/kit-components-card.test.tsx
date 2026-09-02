import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PartComponent, PartList } from '@/api/generated/model';
import { server } from '@/test/msw/server';
import { renderWithRouter } from '@/test/router';

import { KitComponentsCard } from '../components/kit-components-card';

beforeAll(() => {
  // Radix measures its trigger and calls pointer-capture methods on open;
  // jsdom implements neither. Copied from manufacturers-screen.test.tsx.
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

const KIT_ID = 12;
const MANUFACTURER_ID = 5;
const COMPONENTS = `/api/v1/parts/${KIT_ID}/components/`;
const PARTS = '/api/v1/parts/';

/**
 * The card takes `canManage` as a prop rather than reading the auth store, so
 * unlike every sibling screen test this file needs **no** `vi.mock` of
 * `@/auth/auth-context`. The route already computes it for the panel above.
 */
function component(overrides: Partial<PartComponent> = {}): PartComponent {
  // `id` and `item` differ on purpose — the junction row and the component
  // part. A PATCH built from the wrong one would still 200 against a lax mock.
  return {
    id: 41,
    item: 7,
    item_uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    description: 'Locking Screw 3.5mm',
    reference_number: 'LS-3500',
    quantity: 4,
    ...overrides,
  };
}

function part(overrides: Partial<PartList> = {}): PartList {
  return {
    id: 88,
    uuid: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
    name: 'Guide Wire 2.0mm',
    description: 'Guide Wire 2.0mm',
    kind: 'component',
    reference_number: 'GW-2000',
    is_serialized: false,
    manufacturer: MANUFACTURER_ID,
    manufacturer_name: 'Treace',
    ...overrides,
  };
}

const page = <T,>(results: T[]) => ({
  total_data: results.length,
  current_page: 1,
  total_pages: 1,
  next: null,
  previous: null,
  results,
});

let listed: PartComponent[];
let created: unknown[];
let patched: unknown[];
let deleted: string[];
/** Every `page` the panel asked the server for, in order. */
let pagesRequested: (string | null)[];
/** What `total_data` / `total_pages` the list should claim. */
let total: number | null;

beforeEach(() => {
  listed = [component()];
  created = [];
  patched = [];
  deleted = [];
  pagesRequested = [];
  total = null;

  server.use(
    http.get(COMPONENTS, ({ request }) => {
      const url = new URL(request.url);
      pagesRequested.push(url.searchParams.get('page'));
      const body = page(listed);
      if (total !== null) {
        body.total_data = total;
        body.total_pages = Math.ceil(total / 25);
        body.current_page = Number(url.searchParams.get('page') ?? 1);
      }
      return HttpResponse.json(body);
    }),
    http.post(COMPONENTS, async ({ request }) => {
      created.push(await request.json());
      return HttpResponse.json(component({ id: 42, item: 88 }), { status: 201 });
    }),
    http.patch(`${COMPONENTS}:componentPk/`, async ({ request, params }) => {
      patched.push({ componentPk: params.componentPk, body: await request.json() });
      return HttpResponse.json(component({ quantity: 9 }));
    }),
    http.delete(`${COMPONENTS}:componentPk/`, ({ params }) => {
      deleted.push(String(params.componentPk));
      listed = [];
      return new HttpResponse(null, { status: 204 });
    }),
    // The Add dialog resolves a typed catalog number through /parts/.
    http.get(PARTS, () => HttpResponse.json(page([part()]))),
  );
});

function renderCard({ canManage = true } = {}) {
  const onOpenRow = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  // `renderWithRouter`, not a bare `render`: the table's Description cell is a
  // real anchor and `<Link>` reads the router from context. Rendering through
  // a router is asynchronous, so every test below starts by awaiting something.
  renderWithRouter(
    <QueryClientProvider client={client}>
      <KitComponentsCard
        kitId={KIT_ID}
        kitManufacturerId={MANUFACTURER_ID}
        canManage={canManage}
        onOpenRow={onOpenRow}
      />
    </QueryClientProvider>,
  );

  return { onOpenRow, user: userEvent.setup() };
}

describe('KitComponentsCard', () => {
  it('shows a spinner, then the components', async () => {
    renderCard();

    expect(await screen.findByRole('status', { name: 'Loading components' })).toBeInTheDocument();
    expect(await screen.findByText('Locking Screw 3.5mm')).toBeInTheDocument();
  });

  it('offers a retry when the fetch fails', async () => {
    server.use(http.get(COMPONENTS, () => new HttpResponse(null, { status: 500 })));
    const { user } = renderCard();

    expect(await screen.findByText('Could not load the bill of materials')).toBeInTheDocument();

    server.use(http.get(COMPONENTS, () => HttpResponse.json(page([component()]))));
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Locking Screw 3.5mm')).toBeInTheDocument();
  });

  it('says so when the kit has no components', async () => {
    listed = [];
    renderCard();

    expect(await screen.findByText('No components recorded')).toBeInTheDocument();
  });

  it('offers no write controls to someone who cannot write', async () => {
    renderCard({ canManage: false });
    await screen.findByText('Locking Screw 3.5mm');

    expect(screen.queryByRole('button', { name: 'Add component' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument();
  });

  it('asks for one page at a time, not the whole bill of materials', async () => {
    // Not a preference. Against the real catalog the median kit holds 59
    // components and the largest holds 315, and rendering 315 rows — each with
    // a `<Link>` — locks the renderer hard enough to stop the tab responding.
    renderCard();
    await screen.findByText('Locking Screw 3.5mm');

    expect(pagesRequested).toEqual(['1']);
  });

  it('pages, and asks the server for the page it moved to', async () => {
    total = 60;
    const { user } = renderCard();
    await screen.findByText('Locking Screw 3.5mm');
    expect(screen.getByText('Showing 1–25 of 60')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next page' }));

    await waitFor(() => expect(pagesRequested).toEqual(['1', '2']));
  });

  it('steps back a page when the last row on it is removed', async () => {
    // Otherwise the user is left on a page that no longer exists, looking at
    // an empty table and wondering what happened to the rest.
    total = 26;
    const { user } = renderCard();
    await screen.findByText('Locking Screw 3.5mm');
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(pagesRequested).toEqual(['1', '2']));

    await user.click(
      screen.getByRole('button', { name: 'Remove Locking Screw 3.5mm from this kit' }),
    );
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove' }),
    );

    await waitFor(() => expect(deleted).toEqual(['41']));
    await waitFor(() => expect(pagesRequested.at(-1)).toBe('1'));
  });

  it('saves an amended quantity against the BOM row, under the kit', async () => {
    const { user } = renderCard();
    await screen.findByText('Locking Screw 3.5mm');

    await user.click(screen.getByRole('button', { name: 'Edit quantity for Locking Screw 3.5mm' }));
    const quantity = screen.getByLabelText(/Quantity/);
    await user.clear(quantity);
    await user.type(quantity, '9');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // The junction row's id, at a URL carrying the kit's — proving the nested
    // path is built from both and not from the component part.
    await waitFor(() => expect(patched).toEqual([{ componentPk: '41', body: { quantity: 9 } }]));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closes without a request when the quantity is unchanged', async () => {
    const { user } = renderCard();
    await screen.findByText('Locking Screw 3.5mm');

    await user.click(screen.getByRole('button', { name: 'Edit quantity for Locking Screw 3.5mm' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(patched).toEqual([]);
  });

  it('keeps the dialog open and shows the field error the server sent', async () => {
    server.use(
      http.patch(`${COMPONENTS}:componentPk/`, () =>
        HttpResponse.json(
          { quantity: ['Ensure this value is greater than or equal to 1.'] },
          { status: 400 },
        ),
      ),
    );
    const { user } = renderCard();
    await screen.findByText('Locking Screw 3.5mm');

    await user.click(screen.getByRole('button', { name: 'Edit quantity for Locking Screw 3.5mm' }));
    const quantity = screen.getByLabelText(/Quantity/);
    await user.clear(quantity);
    await user.type(quantity, '2');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Ensure this value is greater than or equal to 1.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('removes a component and refetches', async () => {
    const { user } = renderCard();
    await screen.findByText('Locking Screw 3.5mm');

    await user.click(
      screen.getByRole('button', { name: 'Remove Locking Screw 3.5mm from this kit' }),
    );
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove' }),
    );

    await waitFor(() => expect(deleted).toEqual(['41']));
    expect(await screen.findByText('No components recorded')).toBeInTheDocument();
  });

  it('adds a component by catalog number', async () => {
    const { user } = renderCard();
    await screen.findByText('Locking Screw 3.5mm');

    await user.click(screen.getByRole('button', { name: 'Add component' }));
    await user.type(screen.getByLabelText(/Reference #/), 'GW-2000');
    const quantity = screen.getByLabelText(/Quantity/);
    await user.clear(quantity);
    await user.type(quantity, '2');
    await user.click(screen.getByRole('button', { name: 'Add component' }));

    // `item` is the resolved part's id, not the number that was typed.
    await waitFor(() => expect(created).toEqual([{ item: 88, quantity: 2 }]));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('refuses a catalog number belonging to another manufacturer', async () => {
    // The server derives nothing from the number, so an unresolvable one has
    // to be caught here or the wrong part gets added.
    server.use(
      http.get(PARTS, () =>
        HttpResponse.json(page([part({ manufacturer: 99, manufacturer_name: 'Beta Devices' })])),
      ),
    );
    const { user } = renderCard();
    await screen.findByText('Locking Screw 3.5mm');

    await user.click(screen.getByRole('button', { name: 'Add component' }));
    await user.type(screen.getByLabelText(/Reference #/), 'GW-2000');
    await user.click(screen.getByRole('button', { name: 'Add component' }));

    expect(await screen.findByText('This item belongs to Beta Devices')).toBeInTheDocument();
    expect(created).toEqual([]);
  });

  it('surfaces a duplicate refusal under the Reference # field', async () => {
    server.use(
      http.post(COMPONENTS, () =>
        HttpResponse.json(
          { item: ['This part is already in the kit. Amend its quantity instead.'] },
          { status: 400 },
        ),
      ),
    );
    const { user } = renderCard();
    await screen.findByText('Locking Screw 3.5mm');

    await user.click(screen.getByRole('button', { name: 'Add component' }));
    await user.type(screen.getByLabelText(/Reference #/), 'GW-2000');
    await user.click(screen.getByRole('button', { name: 'Add component' }));

    expect(
      await screen.findByText('This part is already in the kit. Amend its quantity instead.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
