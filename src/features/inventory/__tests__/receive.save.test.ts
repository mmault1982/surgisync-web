import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { server } from '@/test/msw/server';

import type { StagedPhoto } from '../receive-kit';
import {
  initialReceiveSaveState,
  isReceiveSaveComplete,
  isRetryingPhotos,
  runReceiveSave,
} from '../receive.save';

/**
 * The create-then-upload sequence, driven directly.
 *
 * The latch is what these tests exist for: once the kit is created, a retry
 * must re-send only the outstanding photos. Without it a second Save after one
 * failed upload registers a **second kit**, which is the worst outcome this
 * screen can produce and the one the user is least likely to notice.
 *
 * Uploads are counted, not named: jsdom's XHR serialises a `File` as an
 * anonymous blob, so the wire cannot say which photo it carried. Which one
 * failed comes back in the returned state instead.
 */

const CREATE = '/api/v1/stock-items/';
const PHOTOS = '/api/v1/stock-items/77/photos/';

let calls: string[];

function photo(key: string): StagedPhoto {
  return {
    key,
    file: new File(['x'], `${key}.png`, { type: 'image/png' }),
    previewUrl: `blob:${key}`,
  };
}

const BODY = { part: 314, manufacturer_kit_id: 'TRC-1', is_complete: true };

function happyPath() {
  server.use(
    http.post(CREATE, () => {
      calls.push('create');
      return HttpResponse.json({ id: 77 }, { status: 201 });
    }),
    http.post(PHOTOS, () => {
      calls.push('photo');
      return HttpResponse.json({ id: 99, url: null }, { status: 201 });
    }),
  );
}

beforeEach(() => {
  calls = [];
});

describe('runReceiveSave', () => {
  it('creates the kit then uploads every photo, in that order', async () => {
    happyPath();

    const state = await runReceiveSave(initialReceiveSaveState(BODY, [photo('a'), photo('b')]));

    expect(calls).toEqual(['create', 'photo', 'photo']);
    expect(state.kitId).toBe(77);
    expect(isReceiveSaveComplete(state)).toBe(true);
    expect(state.error).toBeNull();
  });

  it('uploads photos one request at a time', async () => {
    // Sequential, not parallel: they share a per-user throttle bucket and a
    // burst only makes the 429 harder to read.
    let inFlight = 0;
    let maxInFlight = 0;
    server.use(
      http.post(CREATE, () => HttpResponse.json({ id: 77 }, { status: 201 })),
      http.post(PHOTOS, async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return HttpResponse.json({ id: 99, url: null }, { status: 201 });
      }),
    );

    await runReceiveSave(initialReceiveSaveState(BODY, [photo('a'), photo('b'), photo('c')]));

    expect(maxInFlight).toBe(1);
  });

  it('uploads nothing when the create fails', async () => {
    server.use(
      http.post(CREATE, () => {
        calls.push('create');
        return HttpResponse.json({ part: ['Invalid pk.'] }, { status: 400 });
      }),
      http.post(PHOTOS, () => {
        calls.push('photo');
        return HttpResponse.json({ id: 99 }, { status: 201 });
      }),
    );

    const state = await runReceiveSave(initialReceiveSaveState(BODY, [photo('a')]));

    expect(calls).toEqual(['create']);
    // The latch stays unset, so the form is still fully editable and the next
    // Save creates the kit properly rather than patching up a half-made one.
    expect(state.pendingCreate).not.toBeNull();
    expect(state.kitId).toBeNull();
    expect(state.error).toBeTruthy();
  });

  it('does not create a second kit when a retry follows a failed upload', async () => {
    // The single most important behaviour in this module.
    let photoAttempts = 0;
    server.use(
      http.post(CREATE, () => {
        calls.push('create');
        return HttpResponse.json({ id: 77 }, { status: 201 });
      }),
      http.post(PHOTOS, () => {
        calls.push('photo');
        photoAttempts += 1;
        // The first photo of the first attempt fails; everything else lands.
        return photoAttempts === 1
          ? HttpResponse.json({ detail: 'boom' }, { status: 500 })
          : HttpResponse.json({ id: 99, url: null }, { status: 201 });
      }),
    );

    const first = await runReceiveSave(initialReceiveSaveState(BODY, [photo('a'), photo('b')]));

    expect(first.kitId).toBe(77);
    expect(first.pendingCreate).toBeNull();
    expect(first.pendingPhotos.map((p) => p.key)).toEqual(['a']);
    expect(first.failedPhotos).toEqual(['a']);
    expect(isRetryingPhotos(first)).toBe(true);
    expect(isReceiveSaveComplete(first)).toBe(false);

    calls = [];
    const second = await runReceiveSave(first);

    // No second create, and only the photo that did not land is re-sent.
    expect(calls).toEqual(['photo']);
    expect(isReceiveSaveComplete(second)).toBe(true);
    expect(second.error).toBeNull();
  });

  it('keeps uploading after one photo fails', async () => {
    // The uploads are independent, so stopping early would only cost another
    // retry round.
    let attempts = 0;
    server.use(
      http.post(CREATE, () => HttpResponse.json({ id: 77 }, { status: 201 })),
      http.post(PHOTOS, () => {
        attempts += 1;
        return attempts === 1
          ? HttpResponse.json({ detail: 'boom' }, { status: 500 })
          : HttpResponse.json({ id: 99, url: null }, { status: 201 });
      }),
    );

    const state = await runReceiveSave(
      initialReceiveSaveState(BODY, [photo('a'), photo('b'), photo('c')]),
    );

    expect(attempts).toBe(3);
    expect(state.pendingPhotos.map((p) => p.key)).toEqual(['a']);
  });

  it('never rejects, even when everything fails', async () => {
    server.use(http.post(CREATE, () => HttpResponse.json({ detail: 'boom' }, { status: 500 })));

    await expect(
      runReceiveSave(initialReceiveSaveState(BODY, [photo('a')])),
    ).resolves.toBeDefined();
  });

  it('reports a create with no photos as complete', async () => {
    // Not reachable from the form, which requires one — but the module should
    // not depend on the form's rule to terminate.
    happyPath();

    const state = await runReceiveSave(initialReceiveSaveState(BODY, []));

    expect(calls).toEqual(['create']);
    expect(isReceiveSaveComplete(state)).toBe(true);
  });
});

describe('isRetryingPhotos', () => {
  it('is false before a save has started', () => {
    expect(isRetryingPhotos(null)).toBe(false);
  });

  it('is false while the kit itself is still unsaved', () => {
    expect(isRetryingPhotos(initialReceiveSaveState(BODY, [photo('a')]))).toBe(false);
  });
});
