import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KitStaticMap } from '../components/kit-static-map';
import type { Position } from '../kit-detail';

const POSITION: Position = [39.7684, -86.1581];

/**
 * jsdom has no layout engine and no `ResizeObserver`, so the component's width
 * has to be supplied. Stubbed per file rather than in `src/test/setup.ts`,
 * following `column-menu.test.tsx` — and note the same limit applies: this
 * proves the URL the component asks for and the states it renders, never that
 * the image is positioned or that the pin lands where it should. That stays
 * Playwright's job.
 */
let resize: ((width: number) => void) | undefined;

/** The width reported on mount. Set before `render` to change what is measured. */
let firstWidth = 400;

class MockResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe() {
    resize = (width: number) =>
      this.callback([{ contentRect: { width } } as ResizeObserverEntry], this);
    resize(firstWidth);
  }
  unobserve() {}
  disconnect() {
    resize = undefined;
  }
}

beforeEach(() => {
  firstWidth = 400;
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
});

afterEach(() => {
  resize = undefined;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

/** `aria-hidden` puts the image out of reach of every role query, by design. */
function image(container: HTMLElement): HTMLImageElement {
  const found = container.querySelector('img');
  if (!found) throw new Error('no <img> rendered');
  return found;
}

describe('KitStaticMap', () => {
  it('requests a Static Maps image sized to the measured box', () => {
    const { container } = render(<KitStaticMap position={POSITION} label="Example Hospital" />);

    const src = new URL(image(container).src);
    expect(src.origin + src.pathname).toBe('https://maps.googleapis.com/maps/api/staticmap');
    expect(src.searchParams.get('center')).toBe('39.7684,-86.1581');
    expect(src.searchParams.get('size')).toBe('400x180');
  });

  it('rounds the measured width up to the billing step', () => {
    // Every distinct URL is a billable call, so a fractional layout width — and
    // a drag through the ones next to it — must not mint one each.
    firstWidth = 383.4;
    const { container } = render(<KitStaticMap position={POSITION} label="Example Hospital" />);

    expect(new URL(image(container).src).searchParams.get('size')).toBe('390x180');
  });

  it('debounces a resize but not the first measurement', () => {
    vi.useFakeTimers();
    const { container } = render(<KitStaticMap position={POSITION} label="Example Hospital" />);

    // First paint is immediate — holding the map back to guard against a drag
    // that is not happening would be the wrong trade.
    expect(new URL(image(container).src).searchParams.get('size')).toBe('400x180');

    act(() => resize!(600));
    expect(new URL(image(container).src).searchParams.get('size')).toBe('400x180');

    act(() => void vi.advanceTimersByTime(250));
    expect(new URL(image(container).src).searchParams.get('size')).toBe('600x180');
  });

  it('hides the basemap from assistive tech, as the Leaflet one does', () => {
    // The address and timestamp are rendered as text directly below it.
    const { container } = render(<KitStaticMap position={POSITION} label="Example Hospital" />);
    expect(image(container).closest('[aria-hidden]')).not.toBeNull();
  });

  it('says the map is unavailable rather than showing a broken image', () => {
    // A revoked key, a referrer mismatch and an exhausted quota all land here.
    const { container } = render(<KitStaticMap position={POSITION} label="Example Hospital" />);
    fireEvent.error(image(container));

    expect(screen.getByText('Map unavailable.')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('leaves that message readable to a screen reader', () => {
    const { container } = render(<KitStaticMap position={POSITION} label="Example Hospital" />);
    fireEvent.error(image(container));

    expect(screen.getByText('Map unavailable.').closest('[aria-hidden]')).toBeNull();
  });

  it('holds the box without a key instead of requesting an unkeyed image', () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', '');
    const { container } = render(<KitStaticMap position={POSITION} label="Example Hospital" />);

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeNull();
  });
});
