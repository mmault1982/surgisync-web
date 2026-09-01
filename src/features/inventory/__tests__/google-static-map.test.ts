import { afterEach, describe, expect, it, vi } from 'vitest';

import { googleMapsKey, hasGoogleMaps, staticMapUrl } from '../google-static-map';
import type { Position } from '../kit-detail';

const POSITION: Position = [39.7684, -86.1581];

/** The key is read at call time precisely so this works. */
function withKey(key = 'test-key') {
  vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', key);
}

/** The query string, parsed — asserting on parameter order would be brittle. */
function params(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

afterEach(() => vi.unstubAllEnvs());

describe('googleMapsKey / hasGoogleMaps', () => {
  it('treats an unset key as absent', () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', undefined);
    expect(googleMapsKey()).toBe('');
    expect(hasGoogleMaps()).toBe(false);
  });

  it('treats an empty key as absent, not as a key', () => {
    // The deploy workflows can pass through a blank repository secret, and a
    // blank key would build a URL that 403s on every request.
    withKey('');
    expect(hasGoogleMaps()).toBe(false);
  });

  it('reports a real key', () => {
    withKey();
    expect(hasGoogleMaps()).toBe(true);
  });
});

describe('staticMapUrl', () => {
  it('returns null without a key, so the panel can fall back', () => {
    withKey('');
    expect(staticMapUrl({ position: POSITION, containerWidth: 400 })).toBeNull();
  });

  it('returns null before the box has been measured', () => {
    withKey();
    expect(staticMapUrl({ position: POSITION, containerWidth: 0 })).toBeNull();
  });

  it('points at the Static Maps endpoint with the documented parameters', () => {
    withKey();
    const url = staticMapUrl({ position: POSITION, containerWidth: 400 })!;

    expect(url.startsWith('https://maps.googleapis.com/maps/api/staticmap?')).toBe(true);
    const p = params(url);
    expect(p.get('zoom')).toBe('16');
    expect(p.get('maptype')).toBe('roadmap');
    expect(p.get('key')).toBe('test-key');
  });

  it('formats the centre as bare decimals', () => {
    // Never through a locale-aware formatter: a comma decimal separator would
    // split the coordinate into three values and Google would reject it.
    withKey();
    const p = params(staticMapUrl({ position: POSITION, containerWidth: 400 })!);
    expect(p.get('center')).toBe('39.7684,-86.1581');
  });

  it('asks for twice the pixels, for HiDPI', () => {
    withKey();
    expect(params(staticMapUrl({ position: POSITION, containerWidth: 400 })!).get('scale')).toBe(
      '2',
    );
  });

  it('requests the box size exactly when it fits', () => {
    withKey();
    const p = params(staticMapUrl({ position: POSITION, containerWidth: 400 })!);
    expect(p.get('size')).toBe('400x180');
  });

  it('clamps to the 640px cap and scales the height to keep the aspect ratio', () => {
    // The point of the arithmetic: cropping a too-wide image to fit would take
    // Google's bottom-left logo with it, which is a licence violation. Asking
    // for the box's own aspect ratio means the image only ever scales.
    withKey();
    const p = params(staticMapUrl({ position: POSITION, containerWidth: 850 })!);
    expect(p.get('size')).toBe('640x136'); // 180 * 640 / 850
  });

  it('keeps the requested height at least one pixel', () => {
    withKey();
    const p = params(staticMapUrl({ position: POSITION, containerWidth: 100_000 })!);
    expect(p.get('size')).toBe('640x1');
  });

  it('honours a caller-supplied height', () => {
    withKey();
    const p = params(staticMapUrl({ position: POSITION, containerWidth: 300, height: 90 })!);
    expect(p.get('size')).toBe('300x90');
  });
});
