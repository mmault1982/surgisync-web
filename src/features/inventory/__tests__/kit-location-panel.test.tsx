import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it } from 'vitest';

import { KitLocationPanel } from '../components/kit-location-panel';

import { eventFixture, kitFixture } from './kit-fixture';

/**
 * **No test in this file supplies parseable coordinates**, and that is load-
 * bearing rather than an oversight.
 *
 * Coordinates are what make the panel render `<KitMap>`, which is the only
 * module importing leaflet. `lazy()` is not a barrier in Vitest — it resolves a
 * dynamic import on the next microtask — so rendering the map here would pull a
 * mapping library into jsdom, which has no layout engine to run it in. What the
 * map looks like and whether it collides is Playwright's problem, exactly as
 * `column-menu.test.tsx` records for Radix positioning.
 *
 * Everything worth asserting — the beacon, the meta rows, the empty and error
 * copy, the footer — is reachable without a fix.
 */
beforeAll(() => {
  // Only the confirmation needs these; Radix measures its content on open.
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

const TRACKER = { id: 7, beacon_id: 'HSL-99887', is_active: true };
const BASE = { events: undefined, isPending: false, isError: false };

/** A real event, minus the fix — the autoclave-cycle shape, and the empty state. */
const positionless = eventFixture({ latitude: null, longitude: null });

describe('KitLocationPanel', () => {
  it('renders nothing for a kit with no beacon', () => {
    const { container } = render(<KitLocationPanel {...BASE} kit={kitFixture()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the beacon id whatever the location fetch did', () => {
    // Off `kit.tracker`, never off the events query — a failed fetch must not
    // make an attached beacon vanish from the screen.
    render(<KitLocationPanel {...BASE} isError kit={kitFixture({ tracker: TRACKER })} />);

    expect(screen.getByRole('heading', { name: /Live Location/ })).toBeInTheDocument();
    expect(screen.getByText('HSL-99887')).toBeInTheDocument();
    expect(screen.getByText('Location unavailable right now.')).toBeInTheDocument();
  });

  it('says so when the tracker has never reported', () => {
    render(<KitLocationPanel {...BASE} events={[]} kit={kitFixture({ tracker: TRACKER })} />);
    expect(screen.getByText('No tracking data received yet.')).toBeInTheDocument();
  });

  it('still lists the place names of a fix-less event', () => {
    render(
      <KitLocationPanel {...BASE} events={[positionless]} kit={kitFixture({ tracker: TRACKER })} />,
    );

    expect(screen.getByText('Example Hospital, Indianapolis, IN')).toBeInTheDocument();
    expect(screen.getByText('No tracking data received yet.')).toBeInTheDocument();
  });

  it('reports never-sterilized rather than a blank', () => {
    render(
      <KitLocationPanel {...BASE} events={[positionless]} kit={kitFixture({ tracker: TRACKER })} />,
    );

    expect(screen.getByText('Last sterilized')).toBeInTheDocument();
    expect(screen.getByText('Never')).toBeInTheDocument();
  });

  it('offers the location-history stub and the detach action', () => {
    render(<KitLocationPanel {...BASE} events={[]} kit={kitFixture({ tracker: TRACKER })} />);

    expect(screen.getByRole('button', { name: /View location history/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Detach tracker' })).toBeInTheDocument();
  });

  it('asks before detaching', async () => {
    // The only test here that needs a query client, because the confirmation
    // owns a mutation — and it needs one only once opened. That the other
    // tests do not is the "mounted only while open" property doing its job.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <KitLocationPanel {...BASE} events={[]} kit={kitFixture({ tracker: TRACKER })} />
      </QueryClientProvider>,
    );

    await userEvent.setup().click(screen.getByRole('button', { name: 'Detach tracker' }));

    expect(await screen.findByText('Detach tracker?')).toBeInTheDocument();
  });
});
