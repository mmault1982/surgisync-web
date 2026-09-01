import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { KitLocationPanel } from '../components/kit-location-panel';

import { eventFixture, kitFixture, trackerFixture } from './kit-fixture';

/**
 * **No test here supplies parseable coordinates without also stubbing a Google
 * Maps key**, and that is load-bearing rather than an oversight.
 *
 * Coordinates plus *no* key are what make the panel render `<KitMap>`, the only
 * module importing leaflet. `lazy()` is not a barrier in Vitest — it resolves a
 * dynamic import on the next microtask — so hitting that branch would pull a
 * mapping library into jsdom, which has no layout engine to run it in. What the
 * map looks like and whether it collides is Playwright's problem, exactly as
 * `column-menu.test.tsx` records for Radix positioning.
 *
 * With a key the panel takes the `<KitStaticMap>` branch instead, which is a
 * plain `<img>` and safe here — so the one test that needs a fix stubs the key.
 * Everything else worth asserting — the beacon, the meta rows, the empty and
 * error copy, the footer — is reachable without a fix at all.
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

afterEach(() => vi.unstubAllEnvs());

const TRACKER = trackerFixture();
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

  it('draws the Google basemap for a fix when the build has a key', () => {
    // The only test that supplies coordinates, and it may only do so because
    // the key routes it away from leaflet — see the note at the top of the file.
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
    const { container } = render(
      <KitLocationPanel
        {...BASE}
        events={[eventFixture()]}
        kit={kitFixture({ tracker: TRACKER })}
      />,
    );

    expect(container.querySelector('.leaflet-container')).toBeNull();
    // Width comes from a ResizeObserver, and the stub above never reports one,
    // so the box holds its skeleton. That the panel got this far is the point.
    expect(screen.getByRole('link', { name: /Open in maps/ })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=39.7684,-86.1581',
    );
    expect(screen.queryByText('No tracking data received yet.')).toBeNull();
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
