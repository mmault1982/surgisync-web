import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '@/test/msw/server';

import { ReceiveKitForm } from '../components/receive-kit-form';
import { stockItemKeys } from '../inventory.keys';

const navigate = vi.fn();
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }));

/**
 * Radix's popper measures its trigger and content, and `Select` calls
 * pointer-capture and `scrollIntoView` on open; jsdom implements none of them.
 * None of that is under test — there is no layout engine for the positioning
 * they drive to act on. These stubs only let the form mount and open a select.
 */
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
const PHOTOS = '/api/v1/stock-items/77/photos/';

function renderForm() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={client}>
      <ReceiveKitForm />
    </QueryClientProvider>,
  );

  return { client, user: userEvent.setup() };
}

/** Open a `Select` by its accessible name and choose `option`. */
async function choose(user: ReturnType<typeof userEvent.setup>, name: RegExp, option: RegExp) {
  await user.click(screen.getByRole('combobox', { name }));
  await user.click(await screen.findByRole('option', { name: option }));
}

async function attachPhoto(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(
    screen.getByLabelText('Add photo'),
    new File(['x'], 'a.png', { type: 'image/png' }),
  );
}

/** Fill every required field. */
async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await choose(user, /Manufacturer/, /Treace/);
  await choose(user, /Rep \/ Assigned To/, /Dana Reid/);
  await choose(user, /Physical Location/, /Warehouse/);
  await choose(user, /Kit Name/, /Lapidus Fixation Set/);
  await user.type(screen.getByLabelText(/Kit ID/), 'TRC-LAP-2100');
  await attachPhoto(user);
}

const saveButton = () => screen.getByRole('button', { name: /Save Kit|Retry Photo Upload|Saving/ });

let created: unknown[];

beforeEach(() => {
  navigate.mockClear();
  created = [];
  // Mandatory: `onUnhandledRequest: 'error'` fails the test otherwise, and the
  // form fetches four option lists on mount.
  server.use(
    http.get(MANUFACTURERS, () =>
      HttpResponse.json({
        total_data: 1,
        current_page: 1,
        total_pages: 1,
        next: null,
        previous: null,
        results: [{ id: 5, name: 'Treace', barcode: null }],
      }),
    ),
    http.get(PARTS, () =>
      HttpResponse.json({
        total_data: 1,
        current_page: 1,
        total_pages: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 314,
            uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            name: 'Lapidus Fixation Set',
            kind: 'kit',
            manufacturer: 5,
            manufacturer_name: 'Treace',
          },
        ],
      }),
    ),
    http.get(TARGETS, () =>
      HttpResponse.json({
        results: [
          { type: 'representative', id: 12, name: 'Dana Reid' },
          { type: 'facility', id: 12, name: 'Mercy General' },
        ],
      }),
    ),
    http.get(LOCATIONS, () => HttpResponse.json({ results: ['Warehouse'] })),
    http.post(CREATE, async ({ request }) => {
      created.push(await request.json());
      return HttpResponse.json({ id: 77 }, { status: 201 });
    }),
    http.post(PHOTOS, () => HttpResponse.json({ id: 99, url: null }, { status: 201 })),
  );
});

describe('ReceiveKitForm', () => {
  it('saves a filled form and leaves for the on-hand list', async () => {
    const { client, user } = renderForm();
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await fillForm(user);
    await user.click(saveButton());

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/inventory/on-hand' }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: stockItemKeys.all });
    expect(created).toEqual([
      {
        part: 314,
        manufacturer_kit_id: 'TRC-LAP-2100',
        assigned_to_representative: 12,
        physical_location: 'Warehouse',
        ownership_type: 'consigned',
        is_complete: true,
      },
    ]);
  });

  it('shows required errors and sends nothing on an empty submit', async () => {
    const { user } = renderForm();

    await user.click(saveButton());

    expect(await screen.findByText('Select a manufacturer')).toBeInTheDocument();
    expect(screen.getByText('A kit must have at least one photo')).toBeInTheDocument();
    expect(created).toEqual([]);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('offers only representatives in the Rep picker', async () => {
    // The targets endpoint returns facilities too, and their ids collide with
    // representative ids — 12 is both here. Picking the wrong one would write
    // the wrong column and produce a *wrong* kit rather than a rejected one.
    const { user } = renderForm();

    await user.click(screen.getByRole('combobox', { name: /Rep \/ Assigned To/ }));

    expect(await screen.findByRole('option', { name: /Dana Reid/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Mercy General/ })).not.toBeInTheDocument();
  });

  it('asks the catalog for kits of the chosen manufacturer only', async () => {
    const requests: string[] = [];
    server.use(
      http.get(PARTS, ({ request }) => {
        requests.push(new URL(request.url).search);
        return HttpResponse.json({
          total_data: 0,
          current_page: 1,
          total_pages: 1,
          next: null,
          previous: null,
          results: [],
        });
      }),
    );

    const { user } = renderForm();
    await choose(user, /Manufacturer/, /Treace/);

    await waitFor(() => expect(requests).toHaveLength(1));
    // Without `kind=kit` the picker would offer loose components, and the
    // create endpoint would accept one — filing a component as a kit.
    expect(requests[0]).toContain('kind=kit');
    expect(requests[0]).toContain('manufacturer_id=5');
  });

  it('clears the chosen kit when the manufacturer changes', async () => {
    server.use(
      http.get(MANUFACTURERS, () =>
        HttpResponse.json({
          total_data: 2,
          current_page: 1,
          total_pages: 1,
          next: null,
          previous: null,
          results: [
            { id: 5, name: 'Treace', barcode: null },
            { id: 9, name: 'Stryker', barcode: null },
          ],
        }),
      ),
    );

    const { user } = renderForm();
    await choose(user, /Manufacturer/, /Treace/);
    await choose(user, /Kit Name/, /Lapidus Fixation Set/);
    expect(screen.getByRole('combobox', { name: /Kit Name/ })).toHaveTextContent(
      'Lapidus Fixation Set',
    );

    await choose(user, /Manufacturer/, /Stryker/);

    // A stale kit would file the stock under a manufacturer the user did not
    // pick, and the server derives it from the part, so nothing would reject it.
    expect(screen.getByRole('combobox', { name: /Kit Name/ })).toHaveTextContent('Select kit...');
  });

  it('fills the manufacturer picker from `results`, not the deprecated `data`', async () => {
    // `data` duplicates `results` only until the shipped Flutter build reading
    // it is replaced. A screen built on it breaks with no type error.
    server.use(
      http.get(MANUFACTURERS, () =>
        HttpResponse.json({
          total_data: 1,
          current_page: 1,
          total_pages: 1,
          next: null,
          previous: null,
          results: [{ id: 5, name: 'Treace', barcode: null }],
        }),
      ),
    );

    const { user } = renderForm();
    await user.click(screen.getByRole('combobox', { name: /Manufacturer/ }));

    expect(await screen.findByRole('option', { name: /Treace/ })).toBeInTheDocument();
  });

  it('says so when a manufacturer has no kits this org can receive', async () => {
    // Reachable through no fault of the user: the manufacturer list is the
    // global catalog while the kit list is scoped to the organization.
    server.use(
      http.get(PARTS, () =>
        HttpResponse.json({
          total_data: 0,
          current_page: 1,
          total_pages: 1,
          next: null,
          previous: null,
          results: [],
        }),
      ),
    );

    const { user } = renderForm();
    await choose(user, /Manufacturer/, /Treace/);

    expect(
      await screen.findByText('This manufacturer has no kits you can receive.'),
    ).toBeInTheDocument();
  });

  it('offers the default locations alongside the org facets', async () => {
    const { user } = renderForm();

    await user.click(screen.getByRole('combobox', { name: /Physical Location/ }));

    const listbox = await screen.findByRole('listbox');
    for (const name of ['Home', 'Storage Unit', 'Vehicle', 'Warehouse']) {
      expect(within(listbox).getByRole('option', { name })).toBeInTheDocument();
    }
  });

  it('renders a beacon conflict under the tracker field and clears it on edit', async () => {
    server.use(
      http.post(CREATE, () =>
        HttpResponse.json({ error: 'beacon_in_use', message: 'server prose' }, { status: 409 }),
      ),
    );

    const { user } = renderForm();
    await fillForm(user);
    await user.type(screen.getByLabelText(/Hansel Tracker/), 'HSL-1');
    await user.click(saveButton());

    const conflict = await screen.findByText(/already associated with a different item/);
    expect(conflict).toBeInTheDocument();
    // Nothing was created — perform_create is atomic — so every value stays.
    expect(screen.getByLabelText(/Kit ID/)).toHaveValue('TRC-LAP-2100');
    expect(navigate).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/Hansel Tracker/), '2');

    expect(screen.queryByText(/already associated with a different item/)).not.toBeInTheDocument();
  });

  it('renders a rejected field under its own control', async () => {
    server.use(
      http.post(CREATE, () =>
        HttpResponse.json({ manufacturer_kit_id: ['Already registered.'] }, { status: 400 }),
      ),
    );

    const { user } = renderForm();
    await fillForm(user);
    await user.click(saveButton());

    expect(await screen.findByText('Already registered.')).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('surfaces a rejected field that has no control on this form', async () => {
    server.use(
      http.post(CREATE, () =>
        HttpResponse.json(
          { parent_company: ['Your account is not linked to an organization.'] },
          { status: 400 },
        ),
      ),
    );

    const { user } = renderForm();
    await fillForm(user);
    await user.click(saveButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Your account is not linked to an organization.');
  });

  it('retries only the photos after the kit is saved, and says the kit is saved', async () => {
    let photoAttempts = 0;
    server.use(
      http.post(PHOTOS, () => {
        photoAttempts += 1;
        return photoAttempts === 1
          ? HttpResponse.json({ detail: 'boom' }, { status: 500 })
          : HttpResponse.json({ id: 99, url: null }, { status: 201 });
      }),
    );

    const { user } = renderForm();
    await fillForm(user);
    await user.click(saveButton());

    expect(await screen.findByText(/This kit is already saved/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry Photo Upload' })).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();

    await user.click(saveButton());

    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/inventory/on-hand' }));
    // One create, ever: a second would register a duplicate kit.
    expect(created).toHaveLength(1);
  });

  it('carries the status choice and the ownership type', async () => {
    const { user } = renderForm();
    await fillForm(user);
    await user.click(screen.getByRole('radio', { name: 'Incomplete' }));
    await choose(user, /Type/, /Owned/);
    await user.click(saveButton());

    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toMatchObject({ is_complete: false, ownership_type: 'owned' });
  });

  it('omits notes and the beacon when left blank', async () => {
    const { user } = renderForm();
    await fillForm(user);
    await user.click(saveButton());

    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).not.toHaveProperty('notes');
    expect(created[0]).not.toHaveProperty('beacon_id');
  });

  it('blocks submit past the photo maximum', async () => {
    const { user } = renderForm();
    await fillForm(user);

    await user.upload(
      screen.getByLabelText('Add photo'),
      Array.from({ length: 10 }, (_, i) => new File(['x'], `p${i}.png`, { type: 'image/png' })),
    );
    await user.click(saveButton());

    expect(await screen.findByText('You can attach up to 10 photos')).toBeInTheDocument();
    expect(created).toEqual([]);
  });

  it('says so when an option list cannot be loaded', async () => {
    // A failed query and an org with no values otherwise render the same empty
    // select, and the user is told nothing either way.
    server.use(http.get(MANUFACTURERS, () => HttpResponse.error()));

    renderForm();

    expect(await screen.findByText('Could not load manufacturers.')).toBeInTheDocument();
  });
});
