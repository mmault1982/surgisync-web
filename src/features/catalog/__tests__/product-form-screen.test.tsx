import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PartDetail } from '@/api/generated/model';
import { server } from '@/test/msw/server';

import { ProductFormScreen } from '../components/product-form-screen';

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
    id: 7,
    uuid: 'aaaaaaaa-0000-0000-0000-000000000000',
    name: 'Locking Screw 3.5mm',
    description: 'Locking Screw 3.5mm',
    kind: 'component',
    reference_number: 'LS-3500',
    is_serialized: false,
    manufacturer: 9,
    manufacturer_name: 'Treace Medical',
    udi: '00860000000017',
    list_price: '42.50',
    ...overrides,
  };
}

let created: unknown[];
let patched: { id: string; body: unknown }[];
/** The query the manufacturer picker actually sent, for the `has_items` test. */
let manufacturerRequest: URLSearchParams;

beforeEach(() => {
  created = [];
  patched = [];
  manufacturerRequest = new URLSearchParams();
  server.use(
    http.get(MANUFACTURERS, ({ request }) => {
      manufacturerRequest = new URL(request.url).searchParams;
      return HttpResponse.json({
        total_data: 2,
        current_page: 1,
        total_pages: 1,
        next: null,
        previous: null,
        results: [
          { id: 9, name: 'Treace Medical', barcode: null, is_owned: true },
          { id: 12, name: 'Arthrex', barcode: null, is_owned: true },
        ],
      });
    }),
    http.post(PARTS, async ({ request }) => {
      created.push(await request.json());
      return HttpResponse.json(part({ id: 99 }), { status: 201 });
    }),
    http.patch(`${PARTS}:id/`, async ({ request, params }) => {
      patched.push({ id: String(params.id), body: await request.json() });
      return HttpResponse.json(part());
    }),
  );
});

function renderForm(existing: PartDetail | null = null) {
  const onCancel = vi.fn();
  const onSaved = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={client}>
      <ProductFormScreen part={existing} onCancel={onCancel} onSaved={onSaved} />
    </QueryClientProvider>,
  );

  return { onCancel, onSaved, user: userEvent.setup() };
}

/** Pick an option from one of the two Selects. */
async function choose(user: ReturnType<typeof userEvent.setup>, label: RegExp, option: string) {
  await user.click(screen.getByLabelText(label));
  await user.click(await screen.findByRole('option', { name: option }));
}

describe('the manufacturer picker', () => {
  it('asks for every manufacturer, not only those with parts', async () => {
    // `has_items: true` — what the Receive form sends — would exclude a
    // manufacturer with no parts yet, which is exactly the case of adding the
    // first one.
    renderForm();

    await waitFor(() => expect(manufacturerRequest.has('has_items')).toBe(false));
    expect(await screen.findByLabelText(/Manufacturer/)).toBeInTheDocument();
  });

  it('says so rather than silently offering nothing when it fails', async () => {
    server.use(http.get(MANUFACTURERS, () => HttpResponse.json({}, { status: 500 })));
    renderForm();

    expect(await screen.findByText(/Could not load manufacturers/)).toBeInTheDocument();
  });
});

describe('adding a product', () => {
  it('posts the trimmed body', async () => {
    const { user } = renderForm();
    await screen.findByLabelText(/Manufacturer/);

    await choose(user, /Manufacturer/, 'Arthrex');
    await user.type(screen.getByLabelText(/Description/), '  Cortical Screw 4.0mm  ');
    await user.type(screen.getByLabelText(/Reference #/), 'CS-4000');
    await user.type(screen.getByLabelText(/UDI/), '00860000000024');
    await user.type(screen.getByLabelText(/Price/), '19.99');
    await user.click(screen.getByRole('button', { name: 'Add product' }));

    await waitFor(() =>
      expect(created).toEqual([
        {
          manufacturer: 12,
          kind: 'component',
          is_serialized: false,
          description: 'Cortical Screw 4.0mm',
          reference_number: 'CS-4000',
          udi: '00860000000024',
          list_price: '19.99',
        },
      ]),
    );
  });

  it('sends a null price rather than an empty string', async () => {
    // The column is a decimal: '' reads as a malformed number, not "no price".
    const { user } = renderForm();
    await screen.findByLabelText(/Manufacturer/);

    await choose(user, /Manufacturer/, 'Treace Medical');
    await user.type(screen.getByLabelText(/Description/), 'Cortical Screw');
    await user.click(screen.getByRole('button', { name: 'Add product' }));

    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toMatchObject({ list_price: null });
  });

  it('hands the saved part back, so the caller can open it', async () => {
    const { onSaved, user } = renderForm();
    await screen.findByLabelText(/Manufacturer/);

    await choose(user, /Manufacturer/, 'Treace Medical');
    await user.type(screen.getByLabelText(/Description/), 'Cortical Screw');
    await user.click(screen.getByRole('button', { name: 'Add product' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 99 })));
  });

  it('refuses to submit without a manufacturer or a description', async () => {
    const { user } = renderForm();
    await screen.findByLabelText(/Manufacturer/);

    await user.click(screen.getByRole('button', { name: 'Add product' }));

    expect(await screen.findByText('Choose a manufacturer.')).toBeInTheDocument();
    expect(screen.getByText('Enter a description.')).toBeInTheDocument();
    expect(created).toEqual([]);
  });

  it('offers kind on create', async () => {
    const { user } = renderForm();
    await screen.findByLabelText(/Manufacturer/);

    await choose(user, /Kind/, 'Kit');
    await choose(user, /Manufacturer/, 'Treace Medical');
    await user.type(screen.getByLabelText(/Description/), 'Lapidus Fixation Set');
    await user.click(screen.getByRole('button', { name: 'Add product' }));

    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toMatchObject({ kind: 'kit' });
  });
});

describe('amending a product', () => {
  it('seeds the form from the record', async () => {
    renderForm(part());

    expect(await screen.findByLabelText(/Description/)).toHaveValue('Locking Screw 3.5mm');
    expect(screen.getByLabelText(/Reference #/)).toHaveValue('LS-3500');
    expect(screen.getByLabelText(/UDI/)).toHaveValue('00860000000017');
    expect(screen.getByLabelText(/Price/)).toHaveValue('42.50');
  });

  it('patches only what changed', async () => {
    const { user } = renderForm(part());
    const price = await screen.findByLabelText(/Price/);

    await user.clear(price);
    await user.type(price, '99.00');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(patched).toEqual([{ id: '7', body: { list_price: '99.00' } }]));
  });

  it('fixes kind, because the server refuses to move a part between kinds', async () => {
    // `kind` decides the row's identity space and `source_kind` is stamped
    // once at creation; the sync, the CSV export and the orphan sweep all
    // partition the catalog table on it.
    renderForm(part());

    expect(await screen.findByLabelText(/Kind/)).toBeDisabled();
  });

  it('saves without a request when nothing changed', async () => {
    // Leaving as though it had succeeded, rather than making the user cancel
    // out of a form they did not change.
    const { onSaved, user } = renderForm(part());
    await screen.findByLabelText(/Description/);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(patched).toEqual([]);
  });
});

describe('what the server says', () => {
  it('shows a duplicate reference number under that field', async () => {
    server.use(
      http.post(PARTS, () =>
        HttpResponse.json(
          {
            reference_number: ['This manufacturer already has a part with this reference number.'],
          },
          { status: 400 },
        ),
      ),
    );
    const { user } = renderForm();
    await screen.findByLabelText(/Manufacturer/);

    await choose(user, /Manufacturer/, 'Treace Medical');
    await user.type(screen.getByLabelText(/Description/), 'Cortical Screw');
    await user.type(screen.getByLabelText(/Reference #/), 'LS-3500');
    await user.click(screen.getByRole('button', { name: 'Add product' }));

    expect(
      await screen.findByText('This manufacturer already has a part with this reference number.'),
    ).toBeInTheDocument();
    // Still on the form, so the value that failed can be corrected.
    expect(screen.getByLabelText(/Reference #/)).toHaveValue('LS-3500');
  });

  it('shows a duplicate UDI under that field', async () => {
    server.use(
      http.post(PARTS, () =>
        HttpResponse.json(
          { udi: ['Another active part already carries this UDI.'] },
          { status: 400 },
        ),
      ),
    );
    const { user } = renderForm();
    await screen.findByLabelText(/Manufacturer/);

    await choose(user, /Manufacturer/, 'Treace Medical');
    await user.type(screen.getByLabelText(/Description/), 'Cortical Screw');
    await user.click(screen.getByRole('button', { name: 'Add product' }));

    expect(
      await screen.findByText('Another active part already carries this UDI.'),
    ).toBeInTheDocument();
  });

  it('shows an error no field owns at form level', async () => {
    server.use(
      http.post(PARTS, () =>
        HttpResponse.json(
          { non_field_errors: ['You must belong to an organization to add a catalog part.'] },
          { status: 400 },
        ),
      ),
    );
    const { user } = renderForm();
    await screen.findByLabelText(/Manufacturer/);

    await choose(user, /Manufacturer/, 'Treace Medical');
    await user.type(screen.getByLabelText(/Description/), 'Cortical Screw');
    await user.click(screen.getByRole('button', { name: 'Add product' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You must belong to an organization to add a catalog part.',
    );
  });
});
