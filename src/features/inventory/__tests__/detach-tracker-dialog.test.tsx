import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '@/test/msw/server';

import { DetachTrackerDialog } from '../components/detach-tracker-dialog';

import { kitFixture } from './kit-fixture';

/**
 * The detach confirmation.
 *
 * The point of the dialog is that nothing happens until the user says so, so
 * that is what most of this asserts: cancelling sends no request, and a failed
 * detach leaves the dialog open with the reason on screen rather than closing
 * on a change that did not happen.
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
});

const TRACKER = '/api/v1/stock-items/1/tracker/';

/** How many DELETEs went out. */
let calls: number;

beforeEach(() => {
  calls = 0;
  server.use(
    http.delete(TRACKER, () => {
      calls += 1;
      // 200 with the updated kit, not 204 — see the allowlist note.
      return HttpResponse.json(kitFixture({ tracker: null }));
    }),
  );
});

function renderDialog() {
  const onClose = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <DetachTrackerDialog kit={kitFixture()} onClose={onClose} />
    </QueryClientProvider>,
  );

  return { onClose, user: userEvent.setup() };
}

describe('DetachTrackerDialog', () => {
  it('says what detaching will do', () => {
    renderDialog();

    expect(screen.getByText('Detach tracker?')).toBeTruthy();
    expect(screen.getByText(/stop reporting its location/i)).toBeTruthy();
    // The part that stops this reading as destructive: the hardware is not lost.
    expect(screen.getByText(/attached to another kit afterwards/i)).toBeTruthy();
  });

  it('sends nothing until the user confirms', async () => {
    const { user, onClose } = renderDialog();

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(calls).toBe(0);
    expect(onClose).toHaveBeenCalled();
  });

  it('detaches and closes on confirm', async () => {
    const { user, onClose } = renderDialog();

    await user.click(screen.getByRole('button', { name: /^detach$/i }));

    await waitFor(() => expect(calls).toBe(1));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('stays open and explains a failure', async () => {
    server.use(
      http.delete(TRACKER, () => HttpResponse.json({ detail: 'Not found.' }, { status: 404 })),
    );
    const { user, onClose } = renderDialog();

    await user.click(screen.getByRole('button', { name: /^detach$/i }));

    // A 404 here means the tracker was already gone — closing on it would
    // claim an action this request did not perform.
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});
