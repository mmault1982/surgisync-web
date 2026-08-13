import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '@/test/msw/server';

import { AddTrackerDialog } from '../components/add-tracker-dialog';

import { kitFixture } from './kit-fixture';

/**
 * The Add Hansel Tracker dialog.
 *
 * Two things carry their weight here. A blank beacon must never reach the
 * server — `attach_beacon` strips it, attaches nothing and still answers 200,
 * so an empty submit would close the dialog on a success that did nothing. And
 * the two documented 409s each have to render their own copy under the field
 * rather than the house generic.
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

const KIT = '/api/v1/stock-items/1/';

/** Bodies of every PATCH that went out. */
let patched: unknown[];

beforeEach(() => {
  patched = [];
  server.use(
    http.patch(KIT, async ({ request }) => {
      patched.push(await request.json());
      return HttpResponse.json(kitFixture());
    }),
  );
});

function conflict(code: string, message = 'server copy') {
  server.use(http.patch(KIT, () => HttpResponse.json({ error: code, message }, { status: 409 })));
}

function renderDialog(kit = kitFixture()) {
  const onClose = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <AddTrackerDialog kit={kit} onClose={onClose} />
    </QueryClientProvider>,
  );

  // By role, not by label: the dialog itself is labelled by its title, which
  // is also "…Hansel Tracker", so a label query matches both.
  const field = screen.getByRole('textbox', { name: /hansel tracker/i });
  return { onClose, user: userEvent.setup(), field };
}

describe('submitting', () => {
  it('disables Add until the field has content', async () => {
    const { user, field } = renderDialog();
    const add = screen.getByRole('button', { name: /add tracker/i });

    expect(add).toBeDisabled();
    await user.type(field, 'HSL-9');
    expect(add).toBeEnabled();
  });

  it('never sends a whitespace-only beacon', async () => {
    // The rule this dialog exists to enforce: the server would take it, attach
    // nothing, and answer 200 — a success that did nothing.
    const { user, field, onClose } = renderDialog();

    await user.type(field, '   ');
    await user.type(field, '{Enter}');

    expect(screen.getByRole('button', { name: /add tracker/i })).toBeDisabled();
    expect(patched).toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('sends only the beacon id, trimmed', async () => {
    const { user, field } = renderDialog();

    await user.type(field, '  HSL-9  ');
    await user.click(screen.getByRole('button', { name: /add tracker/i }));

    await waitFor(() => expect(patched).toHaveLength(1));
    // A PATCH: every other field is left alone by omission, so the body has
    // exactly one key.
    expect(patched[0]).toEqual({ beacon_id: 'HSL-9' });
  });

  it('submits on Enter', async () => {
    const { user, field } = renderDialog();

    await user.type(field, 'HSL-9{Enter}');

    await waitFor(() => expect(patched).toHaveLength(1));
  });

  it('closes on success', async () => {
    const { user, field, onClose } = renderDialog();

    await user.type(field, 'HSL-9{Enter}');

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe('conflicts', () => {
  it('explains a beacon that is already on another kit', async () => {
    conflict('beacon_in_use');
    const { user, field, onClose } = renderDialog();

    await user.type(field, 'HSL-9{Enter}');

    expect(await screen.findByText(/already associated with a different item/i)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    // The value stays put so it can be corrected rather than retyped.
    expect(field).toHaveValue('HSL-9');
  });

  it('explains a kit that already has one', async () => {
    conflict('kit_has_tracker');
    const { user, field } = renderDialog();

    await user.type(field, 'HSL-9{Enter}');

    expect(await screen.findByText(/already has a tracker attached/i)).toBeTruthy();
  });

  it('falls back to the server’s own message for a code it does not know', async () => {
    conflict('beacon_retired', 'That beacon was retired in 2025.');
    const { user, field } = renderDialog();

    await user.type(field, 'HSL-9{Enter}');

    expect(await screen.findByText(/retired in 2025/i)).toBeTruthy();
  });

  it('clears the error on the next edit', async () => {
    conflict('beacon_in_use');
    const { user, field } = renderDialog();
    await user.type(field, 'HSL-9{Enter}');
    await screen.findByText(/already associated/i);

    await user.type(field, '9');

    // The message was about a value that no longer exists.
    expect(screen.queryByText(/already associated/i)).toBeNull();
  });
});
