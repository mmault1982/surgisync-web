import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InventoryKitDetail } from '@/api/generated/model';
import { server } from '@/test/msw/server';

import { KitActions } from '../components/kit-actions';
import { UpdateStatusDialog } from '../components/update-status-dialog';
import { stockItemKeys } from '../inventory.keys';

import { kitFixture } from './kit-fixture';

/**
 * Radix's popper measures its trigger and content, and the `Select` calls
 * pointer-capture and `scrollIntoView` on open; jsdom implements none of them.
 * Neither is being tested here — there is no layout engine for the positioning
 * they drive to act on. These stubs only let the dialog mount.
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

const KIT = '/api/v1/stock-items/1/';
const PHOTOS = '/api/v1/stock-items/1/photos/';
const PHOTO = '/api/v1/stock-items/1/photos/:photoId/';
const LOCATIONS = '/api/v1/stock-items/physical-locations/';

/** A kit with one photo, so the min-one rule is satisfied out of the box. */
const withPhoto = (overrides: Partial<InventoryKitDetail> = {}) =>
  kitFixture({
    photos: [{ id: 7, url: 'https://example.test/7.png', created_at: null }],
    photo_count: 1,
    ...overrides,
  });

function photo() {
  return new File(['x'], 'a.png', { type: 'image/png' });
}

function renderDialog(kit = withPhoto()) {
  const onClose = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={client}>
      <UpdateStatusDialog kit={kit} onClose={onClose} />
    </QueryClientProvider>,
  );

  return { onClose, client, user: userEvent.setup() };
}

const chip = (name: string) => screen.getByRole('button', { name });
const save = () => screen.getByRole('button', { name: /Save Status|Retry/ });

beforeEach(() => {
  // Mandatory: `onUnhandledRequest: 'error'` fails the test otherwise, and the
  // dialog fetches the location facets on mount.
  server.use(
    http.get(LOCATIONS, () => HttpResponse.json({ results: ['Rep Vehicle', 'Warehouse'] })),
  );
});

describe('UpdateStatusDialog', () => {
  it('seeds every control from the kit', async () => {
    renderDialog(withPhoto({ notes: 'watch the hinge' }));

    expect(chip('Complete')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('Incomplete')).toHaveAttribute('aria-pressed', 'false');
    expect(chip('Unwrapped')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('Signed In')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText(/Notes/)).toHaveValue('watch the hinge');
    expect(await screen.findByText('Rep Vehicle')).toBeInTheDocument();
    expect(screen.getByText('TRC-MTP-2200')).toBeInTheDocument();
    expect(screen.getByText('Primary')).toBeInTheDocument();
  });

  it('treats a pole pair as two faces of one boolean, disabling nothing', async () => {
    const { user } = renderDialog();

    await user.click(chip('Incomplete'));

    expect(chip('Incomplete')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('Complete')).toHaveAttribute('aria-pressed', 'false');
    for (const label of ['Complete', 'Wrapped', 'Signed Out', 'Lost', 'Other']) {
      expect(chip(label)).toBeEnabled();
    }
  });

  it('toggles Lost without clearing anything else', async () => {
    const { user } = renderDialog();

    await user.click(chip('Lost'));

    // The prototype's "Lost clears all" rule is not this product's.
    expect(chip('Lost')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('Complete')).toHaveAttribute('aria-pressed', 'true');
    expect(chip('Signed In')).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the expired banner without restricting anything', () => {
    renderDialog(withPhoto({ expiration_date: '2020-01-15' }));

    expect(screen.getByText('Expired — kit cannot be used')).toBeInTheDocument();
    expect(screen.getByText(/Exp: 2020-01-15/)).toBeInTheDocument();
    expect(chip('Signed In')).toBeEnabled();
    expect(chip('Wrapped')).toBeEnabled();
  });

  it('requires notes once Lost is selected, and sends nothing until they exist', async () => {
    const { user } = renderDialog();
    let patched = 0;
    server.use(
      http.patch(KIT, () => {
        patched += 1;
        return HttpResponse.json(withPhoto());
      }),
    );

    await user.click(chip('Lost'));
    await user.click(save());

    expect(
      screen.getByText('Notes are required when Lost or Other is selected'),
    ).toBeInTheDocument();
    expect(patched).toBe(0);

    // The message clears as soon as the field is fixed.
    await user.type(screen.getByLabelText(/Notes/), 'left at the hospital');
    expect(
      screen.queryByText('Notes are required when Lost or Other is selected'),
    ).not.toBeInTheDocument();
  });

  it('requires a physical location', async () => {
    const { user } = renderDialog(withPhoto({ physical_location: null }));

    await user.click(save());

    expect(screen.getByText('Select a physical location')).toBeInTheDocument();
  });

  it('requires at least one photo to survive the save', async () => {
    const { user } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Remove photo' }));
    await user.click(save());

    expect(screen.getByText('A kit must have at least one photo')).toBeInTheDocument();
  });

  it('stages a new photo and counts it', async () => {
    const { user } = renderDialog();

    expect(screen.getByText('(1 of 10)')).toBeInTheDocument();
    await user.upload(screen.getByLabelText('Add photo'), photo());

    expect(screen.getByText('(2 of 10)')).toBeInTheDocument();
    expect(screen.getAllByRole('presentation').at(-1)).toHaveAttribute('src', 'blob:mock/1');
  });

  it('sends the six booleans without the photo field, and clears notes with null', async () => {
    const { user } = renderDialog(withPhoto({ notes: 'old', is_returned: true }));
    let body: Record<string, unknown> = {};
    server.use(
      http.patch(KIT, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(withPhoto());
      }),
    );

    await user.clear(screen.getByLabelText(/Notes/));
    await user.click(chip('Wrapped'));
    await user.click(save());

    await waitFor(() =>
      expect(body).toEqual({
        is_complete: true,
        is_wrapped: true,
        is_signed_in: true,
        is_lost: false,
        is_other: false,
        // Echoed from the kit, not defaulted: sending `false` would silently
        // clear it.
        is_returned: true,
        physical_location: 'Rep Vehicle',
        notes: null,
      }),
    );
    // Writing `photo` would replace the primary photo's image in place.
    expect('photo' in body).toBe(false);
  });

  it('closes and invalidates the stock-items prefix on success', async () => {
    const { user, onClose, client } = renderDialog();
    client.setQueryData(stockItemKeys.detail(1), withPhoto());
    server.use(http.patch(KIT, () => HttpResponse.json(withPhoto())));

    await user.click(chip('Incomplete'));
    await user.click(save());

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    // One prefix covers the detail query, the history feed and the on-hand list.
    expect(client.getQueryState(stockItemKeys.detail(1))?.isInvalidated).toBe(true);
  });

  it('stays open on a failed upload, locks the form, and retries only the photo', async () => {
    const { user, onClose } = renderDialog();
    let patched = 0;
    let posts = 0;
    server.use(
      http.patch(KIT, () => {
        patched += 1;
        return HttpResponse.json(withPhoto());
      }),
      http.post(PHOTOS, () => {
        posts += 1;
        return posts === 1
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json({ id: 9, url: null, created_at: null }, { status: 201 });
      }),
    );

    await user.upload(screen.getByLabelText('Add photo'), photo());
    await user.click(save());

    expect(await screen.findByText('Upload failed')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(patched).toBe(1);
    // Locked, so a chip edited now cannot be silently dropped by the latch.
    expect(chip('Incomplete')).toBeDisabled();
    expect(screen.getByLabelText(/Notes/)).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    // The status write happened once, so the kit history narrates it once.
    expect(patched).toBe(1);
    expect(posts).toBe(2);
  });

  it('puts a rejected field under its own control and leaves the form editable', async () => {
    const { user } = renderDialog();
    server.use(
      http.patch(KIT, () =>
        HttpResponse.json(
          { physical_location: ['Unknown location.'], non_field_errors: ['Kit is in transit.'] },
          { status: 400 },
        ),
      ),
    );

    await user.click(save());

    expect(await screen.findByText('Unknown location.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Kit is in transit.');
    // Nothing was written, so nothing is latched.
    expect(chip('Incomplete')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save Status' })).toBeInTheDocument();
  });

  it('deletes a removed photo only after the uploads', async () => {
    const { user } = renderDialog();
    const calls: string[] = [];
    server.use(
      http.patch(KIT, () => {
        calls.push('PATCH');
        return HttpResponse.json(withPhoto());
      }),
      http.post(PHOTOS, () => {
        calls.push('POST');
        return HttpResponse.json({ id: 9, url: null, created_at: null }, { status: 201 });
      }),
      http.delete(PHOTO, ({ params }) => {
        calls.push(`DELETE:${String(params.photoId)}`);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await user.upload(screen.getByLabelText('Add photo'), photo());
    await user.click(screen.getAllByRole('button', { name: 'Remove photo' })[0]!);
    await user.click(save());

    await waitFor(() => expect(calls).toEqual(['PATCH', 'POST', 'DELETE:7']));
  });

  it('discards staged changes when it is closed', async () => {
    const { user, onClose } = renderDialog();

    await user.click(chip('Incomplete'));
    await user.click(screen.getByRole('button', { name: 'Close' }));

    // No confirmation, matching mobile — and no request went out, which
    // `onUnhandledRequest: 'error'` would have caught.
    expect(onClose).toHaveBeenCalled();
  });
});

describe('from KitActions', () => {
  function renderActions(kit = withPhoto()) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <KitActions kit={kit} />
      </QueryClientProvider>,
    );
    return userEvent.setup();
  }

  it('opens the dialog from the Update Status card', async () => {
    const user = renderActions();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Update Status/ }));

    expect(await screen.findByRole('dialog', { name: 'Update Status' })).toBeInTheDocument();
  });

  it('offers nothing to open while the kit is in transit', async () => {
    const user = renderActions(withPhoto({ active_transfer_id: 9 }));

    const card = screen.getByRole('button', { name: /Update Status/ });
    expect(card).toBeDisabled();
    await user.click(card);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
