import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { asFieldErrors } from '@/api/errors';
import { server } from '@/test/msw/server';

import type { PhotoOp } from '../update-status';
import { initialSaveState, runSave, type SaveState } from '../update-status.save';

import { kitFixture } from './kit-fixture';

/**
 * The save sequence, driven directly.
 *
 * PATCH → uploads → deletions and the "never PATCH twice" latch are the two
 * requirements most worth pinning down, and neither needs a rendered dialog —
 * asserting them here keeps the component test about the component.
 *
 * Uploads are counted, not named: jsdom's XHR serialises a `File` as an
 * anonymous blob (`filename="blob"`, no bytes), so the wire cannot say *which*
 * photo it carried. It still proves how many requests went out and in what
 * order; which op each one was comes from the returned state, whose ids are the
 * tile keys the dialog marks.
 */

const KIT = '/api/v1/stock-items/1/';
const PHOTOS = '/api/v1/stock-items/1/photos/';
const PHOTO = '/api/v1/stock-items/1/photos/:photoId/';

/** The order every request arrived in — the whole point of these tests. */
let calls: string[];

function file(name: string) {
  return new File(['x'], name, { type: 'image/png' });
}

const PATCH = { is_complete: true, physical_location: 'Warehouse', notes: null };

const UPLOAD_A: PhotoOp = { kind: 'upload', id: 'file:1', file: file('a.png') };
const UPLOAD_B: PhotoOp = { kind: 'upload', id: 'file:2', file: file('b.png') };
const DELETE_7: PhotoOp = { kind: 'delete', id: 'photo:7', photoId: 7 };
const DELETE_8: PhotoOp = { kind: 'delete', id: 'photo:8', photoId: 8 };
const OPS: PhotoOp[] = [UPLOAD_A, UPLOAD_B, DELETE_7, DELETE_8];

const photoCreated = () =>
  HttpResponse.json({ id: 99, url: null, created_at: null }, { status: 201 });

/** Handlers that all succeed. Individual tests override one with `server.use`. */
function happyPath() {
  server.use(
    http.patch(KIT, () => {
      calls.push('PATCH');
      return HttpResponse.json(kitFixture());
    }),
    http.post(PHOTOS, () => {
      calls.push('POST');
      return photoCreated();
    }),
    http.delete(PHOTO, ({ params }) => {
      calls.push(`DELETE:${String(params.photoId)}`);
      return new HttpResponse(null, { status: 204 });
    }),
  );
}

beforeEach(() => {
  calls = [];
  happyPath();
});

describe('runSave', () => {
  it('writes the status, then uploads, then deletes', async () => {
    const after = await runSave(1, initialSaveState(PATCH, OPS));

    expect(calls).toEqual(['PATCH', 'POST', 'POST', 'DELETE:7', 'DELETE:8']);
    expect(after.pendingPatch).toBeNull();
    expect(after.pendingOps).toEqual([]);
    expect(after.error).toBeNull();
  });

  it('uploads one image per request as multipart', async () => {
    let contentType: string | null = null;
    let body = '';
    server.use(
      http.post(PHOTOS, async ({ request }) => {
        contentType = request.headers.get('content-type');
        body = await request.text();
        return photoCreated();
      }),
    );

    await runSave(1, initialSaveState(PATCH, [UPLOAD_A]));

    // Orval declares `multipart/form-data` with no boundary; axios drops the
    // header so the transport can add one. Without that the server rejects the
    // body as unparseable, which is why this is asserted rather than assumed.
    expect(contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(body.match(/Content-Disposition: form-data; name="[^"]+"/g)).toEqual([
      'Content-Disposition: form-data; name="image"',
    ]);
  });

  it('leaves the patch pending when the status write fails', async () => {
    const state = initialSaveState(PATCH, OPS);
    server.use(
      http.patch(KIT, () => {
        calls.push('PATCH');
        return HttpResponse.json({ physical_location: ['Unknown location.'] }, { status: 400 });
      }),
    );

    const after = await runSave(1, state);

    expect(calls).toEqual(['PATCH']);
    // The same object, not an equal one: nothing was consumed, so a retry
    // sends exactly what the user asked for.
    expect(after.pendingPatch).toBe(state.pendingPatch);
    expect(after.pendingOps).toEqual(OPS);
    expect(asFieldErrors(after.error)).toEqual({ physical_location: ['Unknown location.'] });
  });

  it('skips every deletion when an upload fails', async () => {
    let posts = 0;
    server.use(
      http.post(PHOTOS, () => {
        posts += 1;
        calls.push('POST');
        return posts === 2 ? new HttpResponse(null, { status: 500 }) : photoCreated();
      }),
    );

    const after = await runSave(1, initialSaveState(PATCH, OPS));

    // A deletion cannot be undone and an upload can be retried, so an
    // inconsistent pair sacrifices the retryable half.
    expect(calls).toEqual(['PATCH', 'POST', 'POST']);
    expect(after.pendingOps).toEqual([UPLOAD_B, DELETE_7, DELETE_8]);
    // Only the upload failed. The deletions were never attempted, so they mark
    // nothing — there is no tile left to mark them on anyway.
    expect(after.failedOps).toEqual(['file:2']);
  });

  it('retries only the outstanding work and never re-writes the status', async () => {
    let posts = 0;
    server.use(
      http.post(PHOTOS, () => {
        posts += 1;
        calls.push('POST');
        return posts === 2 ? new HttpResponse(null, { status: 500 }) : photoCreated();
      }),
    );
    const partial = await runSave(1, initialSaveState(PATCH, OPS));
    expect(partial.pendingOps).toHaveLength(3);

    calls = [];
    happyPath();
    const after = await runSave(1, partial);

    // One upload, not two — and no 'PATCH'. Each PATCH appends kit-history
    // entries, and the change happened once.
    expect(calls).toEqual(['POST', 'DELETE:7', 'DELETE:8']);
    expect(after.failedOps).toEqual([]);
    expect(after.error).toBeNull();
    expect(after.pendingOps).toEqual([]);
  });

  it('keeps deleting after one deletion fails', async () => {
    server.use(
      http.delete(PHOTO, ({ params }) => {
        calls.push(`DELETE:${String(params.photoId)}`);
        return params.photoId === '7'
          ? new HttpResponse(null, { status: 500 })
          : new HttpResponse(null, { status: 204 });
      }),
    );

    const after = await runSave(1, initialSaveState(PATCH, OPS));

    expect(calls).toEqual(['PATCH', 'POST', 'POST', 'DELETE:7', 'DELETE:8']);
    expect(after.pendingOps).toEqual([DELETE_7]);
    expect(after.failedOps).toEqual(['photo:7']);
  });

  it('does nothing when there is nothing left to do', async () => {
    const done: SaveState = { pendingPatch: null, pendingOps: [], failedOps: [], error: null };
    expect(await runSave(1, done)).toEqual(done);
    expect(calls).toEqual([]);
  });
});
