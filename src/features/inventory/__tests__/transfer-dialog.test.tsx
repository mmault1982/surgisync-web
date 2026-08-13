import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '@/test/msw/server';

import { TransferDialog } from '../components/transfer-dialog';

import { kitFixture } from './kit-fixture';

/**
 * The Transfer dialog, rendered.
 *
 * The payload algebra lives in `transfer.test.ts`; what needs a DOM is the
 * reactive half — which photo tiles a transport method asks for — and the one
 * thing only the wire can answer: that `stock_items` leaves as a *repeated*
 * multipart field. An indexed key there would attach no kits and still return
 * 201, so the transfer would look created and be empty.
 */

/**
 * Radix's popper measures its trigger and calls pointer-capture methods on
 * open, and jsdom implements neither. Same block as `column-menu.test.tsx`;
 * this dialog opens both a Select and a Popover.
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
  // Assigned, not `??=`: jsdom defines neither, and reading the property to
  // test it trips `@typescript-eslint/unbound-method`.
  let next = 0;
  URL.createObjectURL = () => `blob:mock/${(next += 1)}`;
  URL.revokeObjectURL = () => {};
});

const TARGETS = '/api/v1/inventory-transfers/targets/';
const TRANSFERS = '/api/v1/inventory-transfers/';

/**
 * The raw multipart body of every POST that went out.
 *
 * Deliberately not `request.formData()`: jsdom's XHR serialises a `File` as an
 * anonymous blob, and undici's multipart parser rejects the result outright —
 * the same jsdom limitation `update-status-save.test.ts` works around. Reading
 * the bytes is the stronger assertion anyway, because the field *encoding* is
 * exactly what is under test here.
 */
let posted: string[];

/** Every value sent under one field name, in wire order. */
function valuesOf(raw: string, name: string): string[] {
  const pattern = new RegExp(
    `name="${name.replace(/[[\]]/g, '\\$&')}"\\r?\\n\\r?\\n([^\\r\\n]*)`,
    'g',
  );
  return [...raw.matchAll(pattern)].map((match) => match[1] ?? '');
}

function hasField(raw: string, name: string): boolean {
  return raw.includes(`name="${name}"`);
}

beforeEach(() => {
  posted = [];
  server.use(
    http.get(TARGETS, () =>
      HttpResponse.json({
        results: [
          { type: 'representative', id: 3, name: 'John Smith' },
          { type: 'representative', id: 5, name: 'Sarah Johnson' },
          { type: 'facility', id: 7, name: "St Mary's Hospital" },
        ],
      }),
    ),
    http.post(TRANSFERS, async ({ request }) => {
      posted.push(await request.text());
      return HttpResponse.json({ id: 12 }, { status: 201 });
    }),
  );
});

function renderDialog(kit = kitFixture()) {
  const onClose = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <TransferDialog kit={kit} onClose={onClose} />
    </QueryClientProvider>,
  );

  return { onClose, user: userEvent.setup() };
}

/** Pick an option out of a Radix Select by its trigger's accessible name. */
async function choose(user: ReturnType<typeof userEvent.setup>, field: RegExp, option: RegExp) {
  await user.click(screen.getByRole('combobox', { name: field }));
  await user.click(await screen.findByRole('option', { name: option }));
}

function upload(user: ReturnType<typeof userEvent.setup>, testId: string) {
  return user.upload(
    screen.getByTestId(testId),
    new File(['x'], `${testId}.png`, { type: 'image/png' }),
  );
}

describe('required photos', () => {
  it('asks for none until a transport method is chosen', async () => {
    renderDialog();

    expect(
      await screen.findByText(/select a transport method to see required photos/i),
    ).toBeTruthy();
    expect(screen.queryByTestId('kit-photo')).toBeNull();
  });

  it('asks for the kit photo only when a rep is carrying it', async () => {
    const { user } = renderDialog();

    await choose(user, /transport method/i, /rep transport/i);

    expect(screen.getByTestId('kit-photo')).toBeTruthy();
    expect(screen.queryByTestId('label-photo')).toBeNull();
    expect(screen.getByText(/shipping label not required/i)).toBeTruthy();
  });

  it('asks for both when a carrier is chosen', async () => {
    const { user } = renderDialog();

    await choose(user, /transport method/i, /fedex/i);

    expect(screen.getByTestId('kit-photo')).toBeTruthy();
    expect(screen.getByTestId('label-photo')).toBeTruthy();
  });

  it('drops a staged label photo when switching back to rep transport', async () => {
    const { user } = renderDialog();
    await choose(user, /transport method/i, /ups/i);
    await upload(user, 'label-photo');
    expect(screen.getByRole('button', { name: /remove shipping label/i })).toBeTruthy();

    await choose(user, /transport method/i, /rep transport/i);
    await choose(user, /transport method/i, /ups/i);

    // Back on a carrier, the slot is empty again rather than still holding a
    // file staged for a method that never wanted it.
    expect(screen.queryByRole('button', { name: /remove shipping label/i })).toBeNull();
  });
});

describe('validation', () => {
  it('blocks the save and names the missing destination', async () => {
    const { user } = renderDialog();

    await user.click(screen.getByRole('button', { name: /confirm transfer/i }));

    expect(screen.getByText(/please select where to transfer to/i)).toBeTruthy();
    expect(posted).toHaveLength(0);
  });

  it('blocks the save when the kit photo is missing', async () => {
    const { user } = renderDialog();
    await choose(user, /transfer to/i, /st mary/i);
    await choose(user, /transport method/i, /rep transport/i);

    await user.click(screen.getByRole('button', { name: /confirm transfer/i }));

    expect(screen.getByText(/a kit photo is required/i)).toBeTruthy();
    expect(posted).toHaveLength(0);
  });
});

describe('saving', () => {
  async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
    await choose(user, /transfer to/i, /st mary/i);
    await choose(user, /transport method/i, /rep transport/i);
    await upload(user, 'kit-photo');
    await user.click(screen.getByRole('button', { name: /confirm transfer/i }));
  }

  it('sends stock_items as a repeated field, not an indexed one', async () => {
    const { user } = renderDialog(kitFixture({ id: 42 }));

    await fillAndSubmit(user);

    await waitFor(() => expect(posted).toHaveLength(1));
    const body = posted[0]!;
    // The assertion this test exists for. QueryDict.getlist reads repeated
    // bare keys; `stock_items[0]` would be silently ignored and the transfer
    // would be created with no kits attached — and still return 201.
    expect(valuesOf(body, 'stock_items')).toEqual(['42']);
    expect(hasField(body, 'stock_items[0]')).toBe(false);
    expect(hasField(body, 'inventory_kits')).toBe(false);
  });

  it('sends the route, reason, date and method', async () => {
    const { user } = renderDialog();

    await fillAndSubmit(user);

    await waitFor(() => expect(posted).toHaveLength(1));
    const body = posted[0]!;
    expect(valuesOf(body, 'to_assigned_to_facility')).toEqual(['7']);
    expect(valuesOf(body, 'from_assigned_to_representative')).toEqual(['3']);
    expect(valuesOf(body, 'reason')).toEqual(['surgery']);
    expect(valuesOf(body, 'transport_method')).toEqual(['rep']);
    expect(valuesOf(body, 'transfer_date')[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // The kit photo is the one file a rep transfer carries.
    expect(hasField(body, 'kit_photo')).toBe(true);
    expect(hasField(body, 'label_photo')).toBe(false);
    // Absent, not empty: blank notes are omitted and is_draft is never sent.
    expect(hasField(body, 'notes')).toBe(false);
    expect(hasField(body, 'is_draft')).toBe(false);
    // The two columns this route does not write stay off the wire entirely.
    expect(hasField(body, 'to_assigned_to_representative')).toBe(false);
    expect(hasField(body, 'from_assigned_to_facility')).toBe(false);
  });

  it('closes on success', async () => {
    const { user, onClose } = renderDialog();

    await fillAndSubmit(user);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('stays open and shows the server error on a rejection', async () => {
    server.use(
      http.post(TRANSFERS, () =>
        HttpResponse.json(
          {
            stock_items: ['These stock items are already in transit under another transfer: [1].'],
          },
          { status: 400 },
        ),
      ),
    );
    const { user, onClose } = renderDialog();

    await fillAndSubmit(user);

    expect(await screen.findByText(/already in transit under another transfer/i)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('the route preview', () => {
  it('pre-fills From from the kit and fills To as it is chosen', async () => {
    const { user } = renderDialog();

    const from = screen.getByRole('combobox', { name: /transfer from/i });
    expect(within(from).getByText('John Smith')).toBeTruthy();

    await choose(user, /transfer to/i, /st mary/i);

    const to = screen.getByRole('combobox', { name: /transfer to/i });
    expect(within(to).getByText("St Mary's Hospital")).toBeTruthy();
  });
});
