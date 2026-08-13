import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '@/test/msw/server';

import { ReturnToManufacturerDialog } from '../components/return-to-manufacturer-dialog';

import { kitFixture } from './kit-fixture';

/**
 * The Return dialog, rendered.
 *
 * The payload and notes composition live in `return-to-manufacturer.test.ts`.
 * What needs a DOM: that both photo slots are demanded for every transport
 * method — the rule a copy of the Transfer dialog would have got wrong — and
 * that the condition toggle cannot be cleared.
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

const TRANSFERS = '/api/v1/inventory-transfers/';

/** Raw multipart bodies — `request.formData()` is unusable on a jsdom XHR body. */
let posted: string[];

function valuesOf(raw: string, name: string): string[] {
  const pattern = new RegExp(`name="${name}"\\r?\\n\\r?\\n([^\\r\\n]*)`, 'g');
  return [...raw.matchAll(pattern)].map((match) => match[1] ?? '');
}

function hasField(raw: string, name: string): boolean {
  return raw.includes(`name="${name}"`);
}

beforeEach(() => {
  posted = [];
  server.use(
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
      <ReturnToManufacturerDialog kit={kit} onClose={onClose} />
    </QueryClientProvider>,
  );

  return { onClose, user: userEvent.setup() };
}

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

describe('the form', () => {
  it('names the manufacturer it is sending to', () => {
    renderDialog(kitFixture({ manufacturer_name: 'Treace' }));

    expect(screen.getByText('Treace')).toBeTruthy();
  });

  it('offers both photo slots up front, whatever the transport method', () => {
    // Transfer hides the label slot until a carrier is chosen. A return always
    // wants both, so neither slot is conditional here.
    renderDialog();

    expect(screen.getByTestId('kit-photo')).toBeTruthy();
    expect(screen.getByTestId('label-photo')).toBeTruthy();
  });

  it('seeds the condition from the kit', () => {
    renderDialog(kitFixture({ is_complete: false }));

    expect(screen.getByRole('radio', { name: 'Incomplete' })).toBeChecked();
  });

  it('keeps a pole selected when it is clicked again', async () => {
    const { user } = renderDialog(kitFixture({ is_complete: true }));

    await user.click(screen.getByRole('radio', { name: 'Complete' }));

    // Radix emits '' on a repeat click; storing it would empty a required
    // field with no visible cause.
    expect(screen.getByRole('radio', { name: 'Complete' })).toBeChecked();
  });

  it('switches poles', async () => {
    const { user } = renderDialog(kitFixture({ is_complete: true }));

    await user.click(screen.getByRole('radio', { name: 'Incomplete' }));

    expect(screen.getByRole('radio', { name: 'Incomplete' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Complete' })).not.toBeChecked();
  });
});

describe('validation', () => {
  it('blocks the save without a reason', async () => {
    const { user } = renderDialog();

    await user.click(screen.getByRole('button', { name: /confirm return/i }));

    expect(screen.getByText(/please enter a reason for the return/i)).toBeTruthy();
    expect(posted).toHaveLength(0);
  });

  it('demands a shipping label even for rep transport', async () => {
    const { user } = renderDialog();
    await user.type(screen.getByLabelText(/reason/i), 'Damaged');
    await choose(user, /transport method/i, /rep transport/i);
    await upload(user, 'kit-photo');

    await user.click(screen.getByRole('button', { name: /confirm return/i }));

    expect(screen.getByText(/a shipping label photo is required/i)).toBeTruthy();
    expect(posted).toHaveLength(0);
  });
});

describe('saving', () => {
  async function fillAndSubmit(
    user: ReturnType<typeof userEvent.setup>,
    transport = /rep transport/i,
  ) {
    await user.type(screen.getByLabelText(/reason/i), 'Damaged');
    await choose(user, /transport method/i, transport);
    await upload(user, 'kit-photo');
    await upload(user, 'label-photo');
    await user.click(screen.getByRole('button', { name: /confirm return/i }));
  }

  it('posts a return, not an ordinary transfer', async () => {
    const { user } = renderDialog(kitFixture({ id: 42, parent_company: 4 }));

    await fillAndSubmit(user);

    await waitFor(() => expect(posted).toHaveLength(1));
    const body = posted[0]!;
    expect(valuesOf(body, 'reason')).toEqual(['return']);
    expect(valuesOf(body, 'stock_items')).toEqual(['42']);
    expect(valuesOf(body, 'to_assigned_to_parent_company')).toEqual(['4']);
    // The absence that makes it a return rather than a move.
    expect(hasField(body, 'to_assigned_to_representative')).toBe(false);
    expect(hasField(body, 'to_assigned_to_facility')).toBe(false);
  });

  it('sends both photos on a rep-transport return', async () => {
    const { user } = renderDialog();

    await fillAndSubmit(user);

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(hasField(posted[0]!, 'kit_photo')).toBe(true);
    expect(hasField(posted[0]!, 'label_photo')).toBe(true);
  });

  it('sends the reason and condition as composed notes', async () => {
    const { user } = renderDialog(kitFixture({ is_complete: false }));

    await fillAndSubmit(user);

    await waitFor(() => expect(posted).toHaveLength(1));
    expect(valuesOf(posted[0]!, 'notes')).toEqual([
      'Return reason: Damaged · Condition: Incomplete',
    ]);
  });

  it('closes on success', async () => {
    const { user, onClose } = renderDialog();

    await fillAndSubmit(user);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('stays open and shows an unslotted server error', async () => {
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
