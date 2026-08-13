import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '@/test/msw/server';

import { PendingTransferDialog } from '../components/pending-transfer-dialog';

import { transferFixture } from './kit-fixture';

/**
 * The Pending Transfer dialog.
 *
 * The two behaviours worth pinning: confirming a **return** navigates away,
 * because the same request soft-deletes the kit whose page is underneath, and
 * confirming an ordinary transfer does not. Everything else is the difference
 * between showing the transfer and asking the user to take it on trust.
 */

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }));

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
});

const TRANSFER = '/api/v1/inventory-transfers/12/';
const CONFIRM = '/api/v1/inventory-transfers/12/confirm-receipt/';

const RETURN = transferFixture({
  reason: 'return',
  to_assigned_to_facility: null,
  to_facility_name: null,
  to_assigned_to_parent_company: 1,
  to_parent_company_name: 'Hoosier OsteoTronix',
});

let confirms: number;

beforeEach(() => {
  confirms = 0;
  navigate.mockClear();
  server.use(
    http.get(TRANSFER, () => HttpResponse.json(transferFixture())),
    http.post(CONFIRM, () => {
      confirms += 1;
      return HttpResponse.json(transferFixture());
    }),
  );
});

function renderDialog() {
  const onClose = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <PendingTransferDialog transferId={12} onClose={onClose} />
    </QueryClientProvider>,
  );

  return { onClose, user: userEvent.setup() };
}

describe('showing the transfer', () => {
  it('shows the route, the facts and the notes', async () => {
    server.use(
      http.get(TRANSFER, () =>
        HttpResponse.json(transferFixture({ notes: 'Fragile. Deliver to SPD.' })),
      ),
    );
    renderDialog();

    expect(await screen.findByText('John Smith')).toBeTruthy();
    expect(screen.getByText("St Mary's Hospital")).toBeTruthy();
    expect(screen.getByText('Surgery')).toBeTruthy();
    expect(screen.getByText('FedEx')).toBeTruthy();
    expect(screen.getByText('Fragile. Deliver to SPD.')).toBeTruthy();
  });

  it('cannot confirm before the transfer has loaded', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: /confirm/i })).toBeDisabled();
  });

  it('explains a transfer that is no longer open, and offers no confirm', async () => {
    server.use(
      http.get(TRANSFER, () => HttpResponse.json({ detail: 'Not found.' }, { status: 404 })),
    );
    renderDialog();

    expect(await screen.findByText(/no longer open/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /confirm/i })).toBeDisabled();
  });
});

describe('confirming an ordinary transfer', () => {
  it('hands the kit over and stays put', async () => {
    const { user, onClose } = renderDialog();
    await screen.findByText("St Mary's Hospital");

    await user.click(screen.getByRole('button', { name: /confirm receipt/i }));

    await waitFor(() => expect(confirms).toBe(1));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    // The kit still exists and its page is still valid.
    expect(navigate).not.toHaveBeenCalled();
  });

  it('names the destination in its copy', async () => {
    renderDialog();

    expect(await screen.findByText(/hands the kit over to St Mary's Hospital/i)).toBeTruthy();
  });
});

describe('confirming a return', () => {
  beforeEach(() => {
    server.use(http.get(TRANSFER, () => HttpResponse.json(RETURN)));
  });

  it('warns that the kit leaves inventory', async () => {
    renderDialog();

    expect(await screen.findByText(/removes this kit from your inventory/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /confirm return/i })).toBeTruthy();
  });

  it('navigates to the list, because the kit no longer exists', async () => {
    const { user } = renderDialog();
    await screen.findByRole('button', { name: /confirm return/i });

    await user.click(screen.getByRole('button', { name: /confirm return/i }));

    await waitFor(() => expect(confirms).toBe(1));
    // Staying would leave the user on a detail route for a soft-deleted kit.
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/inventory/on-hand' }));
  });
});

describe('when confirming fails', () => {
  it('stays open and explains a race with someone else', async () => {
    server.use(
      http.post(CONFIRM, () => HttpResponse.json({ detail: 'Not found.' }, { status: 404 })),
    );
    const { user, onClose } = renderDialog();
    await screen.findByText("St Mary's Hospital");

    await user.click(screen.getByRole('button', { name: /confirm receipt/i }));

    // 404 here is the documented idempotency: the transfer was already closed.
    expect(await screen.findByText(/already completed elsewhere/i)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
