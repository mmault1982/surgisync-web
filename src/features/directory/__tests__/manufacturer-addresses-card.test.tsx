import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Address } from '@/api/generated/model';
import { server } from '@/test/msw/server';

import { ManufacturerAddressesCard } from '../components/manufacturer-addresses-card';

import { addressFixture } from './manufacturer-fixture';

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

const ADDRESSES = '/api/v1/directory/companies/:id/addresses/';
const ADDRESS = '/api/v1/directory/companies/:id/addresses/:addressPk/';

let posted: { companyId: string; body: unknown }[];
let patched: { companyId: string; addressPk: string; body: unknown }[];
let deleted: { companyId: string; addressPk: string }[];

beforeEach(() => {
  posted = [];
  patched = [];
  deleted = [];
  server.use(
    http.post(ADDRESSES, async ({ request, params }) => {
      posted.push({ companyId: String(params.id), body: await request.json() });
      return HttpResponse.json(addressFixture({ id: 900 }), { status: 201 });
    }),
    http.patch(ADDRESS, async ({ request, params }) => {
      patched.push({
        companyId: String(params.id),
        addressPk: String(params.addressPk),
        body: await request.json(),
      });
      return HttpResponse.json(addressFixture());
    }),
    http.delete(ADDRESS, ({ params }) => {
      deleted.push({ companyId: String(params.id), addressPk: String(params.addressPk) });
      return new HttpResponse(null, { status: 204 });
    }),
  );
});

/**
 * The card owns no query — the rows arrive off the composite read the route
 * already made. `onUnhandledRequest: 'error'` in the MSW setup is what asserts
 * that: a card that went looking for them would fail loudly.
 */
function renderCard(addresses: Address[] = [addressFixture()], canManage = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      {/* 17, not the manufacturer's 7: these writes are addressed by the
          company's id, and the two are unrelated integers. */}
      <ManufacturerAddressesCard companyId={17} addresses={addresses} canManage={canManage} />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup() };
}

describe('the book', () => {
  it('renders the rows it was handed, without asking for them', async () => {
    renderCard([addressFixture({ label: 'Main Campus', is_primary: true })]);

    expect(await screen.findByText('Main Campus')).toBeInTheDocument();
    expect(screen.getByText('1 Mill Road')).toBeInTheDocument();
    expect(screen.getByText('Primary')).toBeInTheDocument();
  });

  it('names the kinds the way the model does', () => {
    renderCard([addressFixture({ kind: 'shipping' })]);
    expect(screen.getByText('Shipping / Receiving')).toBeInTheDocument();
  });

  it('says the book is shared with the organization’s other roles', () => {
    // The backend publishes `company.id` precisely so a client can notice
    // sharing before someone edits.
    renderCard();
    expect(
      screen.getByText(/belong to the organization behind this manufacturer/),
    ).toBeInTheDocument();
  });

  it('has an empty state', () => {
    renderCard([]);
    expect(screen.getByText('No addresses recorded')).toBeInTheDocument();
  });
});

describe('adding one', () => {
  it('posts to the company, not the manufacturer', async () => {
    const { user } = renderCard([]);

    await user.click(screen.getByRole('button', { name: 'Add address' }));
    await user.type(await screen.findByLabelText(/^Address line 1/), '9 Vendor Way');
    await user.type(screen.getByLabelText(/^City/), 'Carmel');
    await user.click(screen.getByRole('button', { name: 'Add address' }));

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]!.companyId).toBe('17');
    expect(posted[0]!.body).toMatchObject({
      address_line_1: '9 Vendor Way',
      city: 'Carmel',
      kind: 'physical',
      country: 'US',
    });
  });

  it('will not file a blank row', async () => {
    const { user } = renderCard([]);

    await user.click(screen.getByRole('button', { name: 'Add address' }));
    await screen.findByLabelText(/^Address line 1/);
    await user.click(screen.getByRole('button', { name: 'Add address' }));

    // The server accepts `POST {}`; adding one from a web form is a mistake
    // rather than a use case.
    expect(await screen.findByText('Enter a street address.')).toBeInTheDocument();
    expect(posted).toEqual([]);
  });

  it('warns that promoting stands the incumbent down, naming it', async () => {
    const { user } = renderCard([
      addressFixture({ id: 1, label: 'Main Campus', is_primary: true }),
    ]);

    await user.click(screen.getByRole('button', { name: 'Add address' }));
    await user.click(await screen.findByLabelText(/Primary physical address/));

    // Nothing else in the UI would say the sibling had been demoted.
    expect(await screen.findByText(/Replaces Main Campus/)).toBeInTheDocument();
  });
});

describe('amending one', () => {
  it('patches the address under its company, sending only what changed', async () => {
    const { user } = renderCard([addressFixture({ id: 88 })]);

    await user.click(screen.getByRole('button', { name: 'Edit 1 Mill Road' }));
    const city = await screen.findByLabelText('City');
    await user.clear(city);
    await user.type(city, 'Indianapolis');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(patched).toHaveLength(1));
    expect(patched[0]).toMatchObject({
      companyId: '17',
      addressPk: '88',
      body: { city: 'Indianapolis' },
    });
  });
});

describe('removing one', () => {
  it('asks first, then deletes', async () => {
    const { user } = renderCard([addressFixture({ id: 88 })]);

    await user.click(screen.getByRole('button', { name: 'Remove 1 Mill Road' }));
    await user.click(await screen.findByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(deleted).toEqual([{ companyId: '17', addressPk: '88' }]));
  });

  it('says a primary row leaves its kind without one', async () => {
    const { user } = renderCard([addressFixture({ kind: 'billing', is_primary: true })]);

    await user.click(screen.getByRole('button', { name: 'Remove 1 Mill Road' }));

    // The server promotes nothing in its place — which address should take over
    // is a decision, not an ordering — and this is the only place to learn it.
    expect(await screen.findByText(/leaves that kind without one/)).toBeInTheDocument();
  });
});

describe('who may write', () => {
  it('offers a reader no controls at all', () => {
    renderCard([addressFixture()], false);

    expect(screen.queryByRole('button', { name: 'Add address' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument();
    // The rows are still readable.
    expect(screen.getByText('1 Mill Road')).toBeInTheDocument();
  });
});
