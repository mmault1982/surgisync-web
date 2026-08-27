import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PartList } from '@/api/generated/model';
import { server } from '@/test/msw/server';

import { ReceiveSkuForm } from '../components/receive-sku-form';

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));

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

  let next = 0;
  URL.createObjectURL = () => `blob:mock/${(next += 1)}`;
  URL.revokeObjectURL = () => {};
});

const MANUFACTURERS = '/api/v1/manufacturers/';
const PARTS = '/api/v1/parts/';
const TARGETS = '/api/v1/inventory-transfers/targets/';
const LOCATIONS = '/api/v1/stock-items/physical-locations/';
const CREATE = '/api/v1/stock-items/';

function part(overrides: Partial<PartList> = {}): PartList {
  return {
    id: 314,
    uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    // `name` mirrors `description` — it is a deprecated read-only alias of it
    // since the label fold, kept on the wire for shipped Flutter builds. The
    // two split the job by kind before that, and a fixture carrying only a
    // name would have hidden a permanently blank Description field.
    name: 'REAMER CANNULATED ACORN 4.5MM',
    description: 'REAMER CANNULATED ACORN 4.5MM',
    category: 'Reamers',
    kind: 'component',
    reference_number: 'CS-3510',
    is_serialized: false,
    manufacturer: 5,
    manufacturer_name: 'Acme Ortho',
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

function renderForm() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ReceiveSkuForm />
    </QueryClientProvider>,
  );
  return { client, user: userEvent.setup() };
}

async function choose(user: ReturnType<typeof userEvent.setup>, name: RegExp, option: RegExp) {
  await user.click(screen.getByRole('combobox', { name }));
  await user.click(await screen.findByRole('option', { name: option }));
}

/** Fill the session fields and type a catalog number, resolving it on blur. */
async function fillForm(user: ReturnType<typeof userEvent.setup>, reference = 'CS-3510') {
  await choose(user, /Manufacturer/, /Acme Ortho/);
  await choose(user, /Rep \/ Assigned To/, /Dana Reid/);
  await choose(user, /Physical Location/, /Warehouse/);
  await user.type(screen.getByLabelText(/Catalog #/), reference);
  await user.tab();
}

const saveButton = () => screen.getByRole('button', { name: /Save SKU|Retry Photo Upload|Saving/ });

let created: unknown[];
let lookups: string[];

beforeEach(() => {
  created = [];
  lookups = [];
  server.use(
    http.get(MANUFACTURERS, () =>
      HttpResponse.json({
        total_data: 1,
        current_page: 1,
        total_pages: 1,
        next: null,
        previous: null,
        results: [{ id: 5, name: 'Acme Ortho', barcode: null }],
      }),
    ),
    http.get(PARTS, ({ request }) => {
      const url = new URL(request.url);
      lookups.push(url.search);
      return HttpResponse.json(page([part()]));
    }),
    http.get(TARGETS, () =>
      HttpResponse.json({ results: [{ type: 'representative', id: 12, name: 'Dana Reid' }] }),
    ),
    http.get(LOCATIONS, () => HttpResponse.json({ results: ['Warehouse'] })),
    http.post(CREATE, async ({ request }) => {
      created.push(await request.json());
      return HttpResponse.json({ id: 77 }, { status: 201 });
    }),
  );
});

describe('ReceiveSkuForm', () => {
  it('resolves a catalog number and shows its description', async () => {
    const { user } = renderForm();

    await user.type(screen.getByLabelText(/Catalog #/), 'CS-3510');
    await user.tab();

    expect(await screen.findByText('REAMER CANNULATED ACORN 4.5MM')).toBeInTheDocument();
    // Looked up by exact number, unscoped by manufacturer — the wrong-
    // manufacturer case has to stay distinguishable from a typo.
    expect(lookups.some((search) => search.includes('reference_number=CS-3510'))).toBe(true);
  });

  it('saves the resolved part with its quantity', async () => {
    const { user } = renderForm();
    await fillForm(user);
    await user.clear(screen.getByLabelText(/Quantity/));
    await user.type(screen.getByLabelText(/Quantity/), '4');
    await user.click(saveButton());

    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toEqual({
      part: 314,
      quantity: 4,
      assigned_to_representative: 12,
      physical_location: 'Warehouse',
      ownership_type: 'consigned',
    });
  });

  it('blocks a number belonging to another manufacturer, and names it', async () => {
    server.use(
      http.get(PARTS, () =>
        HttpResponse.json(page([part({ manufacturer: 9, manufacturer_name: 'Beta Devices' })])),
      ),
    );

    const { user } = renderForm();
    await fillForm(user);
    await user.click(saveButton());

    expect(await screen.findByText('This item belongs to Beta Devices')).toBeInTheDocument();
    expect(created).toEqual([]);
  });

  it('re-judges the mismatch when the manufacturer changes', async () => {
    // Picking the right manufacturer should clear the mismatch without making
    // the user retype a number that was always correct.
    server.use(
      http.get(MANUFACTURERS, () =>
        HttpResponse.json({
          total_data: 2,
          current_page: 1,
          total_pages: 1,
          next: null,
          previous: null,
          results: [
            { id: 5, name: 'Acme Ortho', barcode: null },
            { id: 9, name: 'Beta Devices', barcode: null },
          ],
        }),
      ),
      http.get(PARTS, () =>
        HttpResponse.json(page([part({ manufacturer: 9, manufacturer_name: 'Beta Devices' })])),
      ),
    );

    const { user } = renderForm();
    await choose(user, /Manufacturer/, /Acme Ortho/);
    await user.type(screen.getByLabelText(/Catalog #/), 'CS-3510');
    await user.tab();
    expect(await screen.findByText('This item belongs to Beta Devices')).toBeInTheDocument();

    await choose(user, /Manufacturer/, /Beta Devices/);

    await waitFor(() =>
      expect(screen.queryByText('This item belongs to Beta Devices')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('REAMER CANNULATED ACORN 4.5MM')).toBeInTheDocument();
  });

  it('reports a number no catalog item carries', async () => {
    server.use(http.get(PARTS, () => HttpResponse.json(page([]))));

    const { user } = renderForm();
    await fillForm(user, 'NOPE-1');
    await user.click(saveButton());

    expect(await screen.findByText('No catalog item has that number')).toBeInTheDocument();
    expect(created).toEqual([]);
  });

  it('drops the resolved item as soon as the number is edited', async () => {
    // A stale description would describe a part the field no longer names.
    const { user } = renderForm();
    await fillForm(user);
    expect(await screen.findByText('REAMER CANNULATED ACORN 4.5MM')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Catalog #/), '9');

    expect(screen.queryByText('REAMER CANNULATED ACORN 4.5MM')).not.toBeInTheDocument();
  });

  it('pins the quantity to 1 for a serialized part', async () => {
    server.use(http.get(PARTS, () => HttpResponse.json(page([part({ is_serialized: true })]))));

    const { user } = renderForm();
    await fillForm(user);

    const quantity = await screen.findByLabelText(/Quantity/);
    expect(quantity).toBeDisabled();
    expect(quantity).toHaveValue('1');
    expect(screen.getByText(/serialized — quantity is 1/)).toBeInTheDocument();

    await user.click(saveButton());
    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toMatchObject({ quantity: 1 });
  });

  it('rejects a quantity below 1', async () => {
    const { user } = renderForm();
    await fillForm(user);
    await user.clear(screen.getByLabelText(/Quantity/));
    await user.type(screen.getByLabelText(/Quantity/), '0');
    await user.click(saveButton());

    expect(await screen.findByText('Enter a quantity of 1 or more')).toBeInTheDocument();
    expect(created).toEqual([]);
  });

  it('saves without a photo', async () => {
    // Optional here, unlike a kit.
    const { user } = renderForm();
    await fillForm(user);
    await user.click(saveButton());

    await waitFor(() => expect(created).toHaveLength(1));
  });

  it('keeps the session fields and clears the item after a save', async () => {
    const { user } = renderForm();
    await fillForm(user);
    await user.type(screen.getByLabelText(/Lot Code/), 'LOT-1');
    await user.click(saveButton());

    expect(await screen.findByText(/Item saved/)).toBeInTheDocument();

    // Session survives...
    expect(screen.getByRole('combobox', { name: /Manufacturer/ })).toHaveTextContent('Acme Ortho');
    expect(screen.getByRole('combobox', { name: /Physical Location/ })).toHaveTextContent(
      'Warehouse',
    );
    // ...the item does not.
    expect(screen.getByLabelText(/Catalog #/)).toHaveValue('');
    expect(screen.getByLabelText(/Lot Code/)).toHaveValue('');
    expect(screen.getByLabelText(/Quantity/)).toHaveValue('1');
  });

  it('resolves a number that was typed but never blurred', async () => {
    // Submitting straight from the field must not fail on "look it up first"
    // for a value that is perfectly good.
    const { user } = renderForm();
    await choose(user, /Manufacturer/, /Acme Ortho/);
    await choose(user, /Rep \/ Assigned To/, /Dana Reid/);
    await choose(user, /Physical Location/, /Warehouse/);
    await user.type(screen.getByLabelText(/Catalog #/), 'CS-3510');

    await user.click(saveButton());

    await waitFor(() => expect(created).toHaveLength(1));
  });

  it('sends the optional fields when filled', async () => {
    const { user } = renderForm();
    await fillForm(user);
    await user.type(screen.getByLabelText(/UDI/), '(01)123');
    await user.type(screen.getByLabelText(/Lot Code/), 'LOT-1');
    await user.type(screen.getByLabelText(/Notes/), 'boxed');
    await user.click(saveButton());

    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toMatchObject({ udi: '(01)123', lot_code: 'LOT-1', notes: 'boxed' });
  });

  it('surfaces a rejected quantity under the quantity field', async () => {
    server.use(
      http.post(CREATE, () =>
        HttpResponse.json({ quantity: ['Serialized parts must be 1.'] }, { status: 400 }),
      ),
    );

    const { user } = renderForm();
    await fillForm(user);
    await user.click(saveButton());

    expect(await screen.findByText('Serialized parts must be 1.')).toBeInTheDocument();
  });
});
