import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PartDetail } from '@/api/generated/model';
import { server } from '@/test/msw/server';

import { AddProductDialog } from '../components/add-product-dialog';

/**
 * Creating the catalog part a Receive lookup failed to find.
 *
 * What is worth asserting here is the seam, not the seven controls — those are
 * `ProductFields`, already covered by `product-form-screen.test.tsx`. This
 * covers what only this dialog does: the seed, the locked kind, and handing
 * the created part back to the caller.
 */

beforeAll(() => {
  // Radix's popper measures its trigger and calls pointer-capture methods on
  // open; jsdom implements neither. Needed for the two `Select`s.
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
const MANUFACTURERS = '/api/v1/manufacturers/';

function part(overrides: Partial<PartDetail> = {}): PartDetail {
  return {
    id: 99,
    uuid: 'aaaaaaaa-0000-0000-0000-000000000000',
    name: 'Reamer Cannulated 4.5mm',
    description: 'Reamer Cannulated 4.5mm',
    kind: 'component',
    reference_number: 'CS-3510',
    is_serialized: false,
    manufacturer: 9,
    manufacturer_name: 'Treace Medical',
    udi: null,
    list_price: null,
    ...overrides,
  };
}

let created: unknown[];
/** What the POST answers with, so one test can make it a 400. */
let respond: () => Response;

beforeEach(() => {
  created = [];
  respond = () => HttpResponse.json(part(), { status: 201 });
  server.use(
    http.get(MANUFACTURERS, () =>
      HttpResponse.json({
        total_data: 2,
        current_page: 1,
        total_pages: 1,
        next: null,
        previous: null,
        results: [
          { id: 9, name: 'Treace Medical', barcode: null, is_owned: true },
          { id: 12, name: 'Arthrex', barcode: null, is_owned: true },
        ],
      }),
    ),
    http.post(PARTS, async ({ request }) => {
      created.push(await request.json());
      return respond();
    }),
  );
});

function renderDialog(seed = { manufacturerId: 9 as number | null, referenceNumber: 'CS-3510' }) {
  const onCreated = vi.fn();
  const onClose = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={client}>
      <AddProductDialog seed={seed} onCreated={onCreated} onClose={onClose} />
    </QueryClientProvider>,
  );

  return { onCreated, onClose, user: userEvent.setup() };
}

describe('AddProductDialog', () => {
  it('seeds the manufacturer and reference number from the receive flow', async () => {
    renderDialog();

    // The manufacturer arrives with the picker's options, not with the seed.
    await waitFor(() => expect(screen.getByLabelText(/manufacturer/i)).toHaveTextContent('Treace'));
    expect(screen.getByLabelText(/reference #/i)).toHaveValue('CS-3510');
  });

  it('fixes the kind to Component', async () => {
    renderDialog();

    const kind = await screen.findByLabelText(/kind/i);
    expect(kind).toHaveTextContent('Component');
    // A catalog number belongs to a component — kits carry none — so there is
    // nothing here to choose between.
    expect(kind).toBeDisabled();
  });

  it('creates the part and hands it back', async () => {
    const { onCreated, user } = renderDialog();

    await waitFor(() => expect(screen.getByLabelText(/manufacturer/i)).toHaveTextContent('Treace'));
    await user.type(screen.getByLabelText(/description/i), 'Reamer Cannulated 4.5mm');
    await user.click(screen.getByRole('button', { name: 'Add product' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(created).toEqual([
      {
        manufacturer: 9,
        kind: 'component',
        is_serialized: false,
        description: 'Reamer Cannulated 4.5mm',
        reference_number: 'CS-3510',
        udi: '',
        list_price: null,
      },
    ]);
    expect(onCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 99, description: 'Reamer Cannulated 4.5mm' }),
    );
  });

  it('shows a duplicate catalog number under the reference field', async () => {
    // The case this dialog will actually meet: the lookup found nothing
    // because the part is filed under a manufacturer it did not search.
    respond = () =>
      HttpResponse.json(
        { reference_number: ['A part with this reference number already exists.'] },
        { status: 400 },
      );
    const { onCreated, user } = renderDialog();

    await waitFor(() => expect(screen.getByLabelText(/manufacturer/i)).toHaveTextContent('Treace'));
    await user.type(screen.getByLabelText(/description/i), 'Reamer Cannulated 4.5mm');
    await user.click(screen.getByRole('button', { name: 'Add product' }));

    expect(
      await screen.findByText('A part with this reference number already exists.'),
    ).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('does not post a form with no description', async () => {
    const { user } = renderDialog();

    await waitFor(() => expect(screen.getByLabelText(/manufacturer/i)).toHaveTextContent('Treace'));
    await user.click(screen.getByRole('button', { name: 'Add product' }));

    expect(await screen.findByText('Enter a description.')).toBeInTheDocument();
    expect(created).toEqual([]);
  });

  it('leaves the manufacturer unchosen when the receive form has none', async () => {
    renderDialog({ manufacturerId: null, referenceNumber: 'CS-3510' });

    await waitFor(() =>
      expect(screen.getByLabelText(/manufacturer/i)).toHaveTextContent('Choose a manufacturer'),
    );
  });
});
