import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '@/test/msw/server';

import { KitDetailBanners } from '../components/kit-detail-banners';

import { kitFixture, transferFixture } from './kit-fixture';

/**
 * The two notices above the kit card.
 *
 * The asymmetry is the point: the amber one became a button when Confirm
 * Receipt landed behind it, and the red one stays a plain `<div>` because the
 * action it would point at lives in the column below, not here.
 */

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));

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

beforeEach(() => {
  server.use(
    http.get('/api/v1/inventory-transfers/12/', () => HttpResponse.json(transferFixture())),
  );
});

const IN_TRANSIT = kitFixture({
  active_transfer_id: 12,
  active_transfer_destination_name: "St Mary's Hospital",
});

function renderBanners(kit = IN_TRANSIT) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <KitDetailBanners kit={kit} />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

describe('KitDetailBanners', () => {
  it('renders nothing for a healthy kit', () => {
    const client = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={client}>
        <KitDetailBanners kit={kitFixture()} />
      </QueryClientProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('names the destination in the transit banner', () => {
    renderBanners();

    expect(screen.getByRole('button', { name: /In Transit → St Mary's Hospital/ })).toBeTruthy();
  });

  it('still appears when the API named no destination', () => {
    renderBanners(kitFixture({ active_transfer_id: 12, active_transfer_destination_name: null }));

    expect(screen.getByRole('button', { name: /In Transit/ })).toBeTruthy();
  });

  it('opens the pending transfer from the banner', async () => {
    const user = renderBanners();

    await user.click(screen.getByRole('button', { name: /In Transit/ }));

    expect(await screen.findByText('Pending Transfer')).toBeTruthy();
  });

  it('leaves the expired banner inert', () => {
    renderBanners(kitFixture({ expiration_date: '2020-01-15' }));

    expect(screen.getByText('Expired — kit cannot be used')).toBeTruthy();
    // Not a button: Return to Manufacturer lives in the action column, and a
    // banner that looks clickable but is not is worse than one that does not.
    expect(screen.queryByRole('button')).toBeNull();
  });
});
