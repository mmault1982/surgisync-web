import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';

import {
  addFiles,
  buildStatusPatch,
  hasFormErrors,
  isChipSelected,
  MAX_PHOTOS,
  photoCount,
  planPhotoOps,
  removeTile,
  saveErrorMessage,
  seedFlags,
  seedStrip,
  stagedUrls,
  statusFieldErrors,
  STATUS_CHIPS,
  STATUS_LEGEND,
  toggleChip,
  validateStatusForm,
  withCurrentLocation,
  type StatusFlags,
} from '../update-status';
import { isSaveComplete, madeProgress, type SaveState } from '../update-status.save';

import { kitFixture } from './kit-fixture';

const chip = (key: string) => STATUS_CHIPS.find((candidate) => candidate.key === key)!;

const values = (flags: StatusFlags, location = 'Rep Vehicle', notes = '') => ({
  flags,
  location,
  notes,
});

function file(name: string) {
  return new File(['x'], name, { type: 'image/png' });
}

function fieldError(data: unknown, status = 400) {
  const error = new AxiosError('failed');
  error.response = {
    data,
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
  };
  return error;
}

describe('status flags', () => {
  it('seeds from the kit, reading an omitted flag as false', () => {
    expect(seedFlags(kitFixture())).toEqual({
      is_complete: true,
      is_wrapped: false,
      is_signed_in: true,
      is_lost: false,
      is_other: false,
    });

    expect(seedFlags(kitFixture({ is_complete: undefined })).is_complete).toBe(false);
  });

  it('lays the eight chips out row-major across four columns', () => {
    expect(STATUS_CHIPS.map((c) => c.label)).toEqual([
      'Complete',
      'Wrapped',
      'Signed In',
      'Lost',
      'Incomplete',
      'Unwrapped',
      'Signed Out',
      'Other',
    ]);
    expect(STATUS_LEGEND).toHaveLength(5);
  });

  it('treats a pole pair as two faces of one boolean', () => {
    const flags = seedFlags(kitFixture());
    expect(isChipSelected(chip('complete'), flags)).toBe(true);
    expect(isChipSelected(chip('incomplete'), flags)).toBe(false);

    const next = toggleChip(flags, chip('incomplete'));
    expect(next.is_complete).toBe(false);
    expect(isChipSelected(chip('complete'), next)).toBe(false);
    expect(isChipSelected(chip('incomplete'), next)).toBe(true);
    // The other four booleans are untouched.
    expect({ ...next, is_complete: true }).toEqual({ ...flags, is_complete: true });
  });

  it('leaves a pole lit when it is clicked again', () => {
    const flags = seedFlags(kitFixture());
    expect(toggleChip(flags, chip('complete'))).toEqual(flags);
  });

  it('toggles Lost and Other independently and clears nothing', () => {
    const flags = seedFlags(kitFixture());

    const lost = toggleChip(flags, chip('lost'));
    // The prototype's "Lost clears all" rule was explicitly decided against.
    expect(lost).toEqual({ ...flags, is_lost: true });
    expect(toggleChip(lost, chip('lost')).is_lost).toBe(false);

    const both = toggleChip(lost, chip('other'));
    expect(both).toEqual({ ...flags, is_lost: true, is_other: true });
  });
});

describe('buildStatusPatch', () => {
  it('sends all six booleans with is_returned echoed from the kit', () => {
    const kit = kitFixture({ is_returned: true });
    const patch = buildStatusPatch(kit, values(seedFlags(kit), 'Warehouse', ' checked '));

    expect(patch).toEqual({
      is_complete: true,
      is_wrapped: false,
      is_signed_in: true,
      is_lost: false,
      is_other: false,
      is_returned: true,
      physical_location: 'Warehouse',
      notes: 'checked',
    });
  });

  it('never writes the photo field', () => {
    const kit = kitFixture({ photo: 'https://example.test/a.png' });
    expect('photo' in buildStatusPatch(kit, values(seedFlags(kit)))).toBe(false);
  });

  it('omits is_returned when the kit did not report it', () => {
    const kit = kitFixture({ is_returned: undefined });
    expect('is_returned' in buildStatusPatch(kit, values(seedFlags(kit)))).toBe(false);
  });

  it('clears notes with an explicit null', () => {
    const kit = kitFixture({ notes: 'old' });
    expect(buildStatusPatch(kit, values(seedFlags(kit), 'Warehouse', '')).notes).toBeNull();
    expect(buildStatusPatch(kit, values(seedFlags(kit), 'Warehouse', '   ')).notes).toBeNull();
  });
});

describe('photo staging', () => {
  const kit = kitFixture({
    photos: [
      { id: 7, url: 'https://example.test/7.png', created_at: null },
      { id: 8, url: null, created_at: null },
    ],
  });

  it('seeds from the kit in server order', () => {
    const strip = seedStrip(kit);
    expect(strip.tiles).toEqual([
      { kind: 'existing', key: 'photo:7', photoId: 7, url: 'https://example.test/7.png' },
      { kind: 'existing', key: 'photo:8', photoId: 8, url: null },
    ]);
    expect(strip.removed).toEqual([]);
  });

  it('stages a removal of a server photo rather than losing it', () => {
    const { next, revoke } = removeTile(seedStrip(kit), 'photo:7');
    expect(revoke).toBeNull();
    expect(next.removed).toEqual([7]);
    expect(photoCount(next)).toBe(1);
  });

  it('hands back the object URL when a staged photo is dropped', () => {
    const added = addFiles(seedStrip(kit), [{ file: file('a.png'), previewUrl: 'blob:1' }]);
    expect(stagedUrls(added)).toEqual(['blob:1']);

    const { next, revoke } = removeTile(added, 'file:1');
    expect(revoke).toBe('blob:1');
    expect(next.removed).toEqual([]);
    expect(stagedUrls(next)).toEqual([]);
  });

  it('gives a re-added file a fresh key', () => {
    const once = addFiles(seedStrip(kit), [{ file: file('a.png'), previewUrl: 'blob:1' }]);
    const twice = addFiles(removeTile(once, 'file:1').next, [
      { file: file('a.png'), previewUrl: 'blob:2' },
    ]);
    expect(twice.tiles.at(-1)?.key).toBe('file:2');
  });

  it('plans uploads before deletions', () => {
    const strip = addFiles(removeTile(seedStrip(kit), 'photo:7').next, [
      { file: file('a.png'), previewUrl: 'blob:1' },
      { file: file('b.png'), previewUrl: 'blob:2' },
    ]);

    expect(planPhotoOps(strip).map((op) => `${op.kind}:${op.id}`)).toEqual([
      'upload:file:1',
      'upload:file:2',
      'delete:photo:7',
    ]);
  });

  it('predicts the post-save server order, which is what makes tile 0 primary', () => {
    // Uploads land after the surviving existing photos, then the removed ones
    // disappear — so the strip's own order is the order the server will hold.
    const strip = addFiles(removeTile(seedStrip(kit), 'photo:7').next, [
      { file: file('c.png'), previewUrl: 'blob:1' },
    ]);

    expect(strip.tiles.map((tile) => tile.key)).toEqual(['photo:8', 'file:1']);
  });
});

describe('validateStatusForm', () => {
  const oneStaged = addFiles(seedStrip(kitFixture()), [
    { file: file('a.png'), previewUrl: 'blob:1' },
  ]);

  it('requires a physical location', () => {
    expect(validateStatusForm(values(seedFlags(kitFixture()), '  '), oneStaged).location).toBe(
      'Select a physical location',
    );
    expect(validateStatusForm(values(seedFlags(kitFixture())), oneStaged).location).toBeUndefined();
  });

  it('requires notes when Lost or Other is selected, and not otherwise', () => {
    const flags = seedFlags(kitFixture());
    expect(validateStatusForm(values(flags), oneStaged).notes).toBeUndefined();

    for (const key of ['lost', 'other']) {
      const selected = toggleChip(flags, chip(key));
      expect(validateStatusForm(values(selected), oneStaged).notes).toBe(
        'Notes are required when Lost or Other is selected',
      );
      expect(
        validateStatusForm(values(selected, 'Rep Vehicle', 'why'), oneStaged).notes,
      ).toBeUndefined();
    }
  });

  it('holds the photo count between one and ten', () => {
    const flags = seedFlags(kitFixture());
    const strip = (n: number) =>
      addFiles(
        seedStrip(kitFixture()),
        Array.from({ length: n }, (_, i) => ({ file: file(`${i}.png`), previewUrl: `blob:${i}` })),
      );

    expect(validateStatusForm(values(flags), strip(0)).photos).toBe(
      'A kit must have at least one photo',
    );
    expect(validateStatusForm(values(flags), strip(1)).photos).toBeUndefined();
    expect(validateStatusForm(values(flags), strip(MAX_PHOTOS)).photos).toBeUndefined();
    expect(validateStatusForm(values(flags), strip(MAX_PHOTOS + 1)).photos).toBe(
      'You can attach up to 10 photos',
    );
  });

  it('reports whether anything is wrong', () => {
    expect(hasFormErrors({})).toBe(false);
    expect(hasFormErrors({ notes: 'nope' })).toBe(true);
  });
});

describe('server errors', () => {
  it('maps a bare field map onto the form slots', () => {
    expect(
      statusFieldErrors(
        fieldError({ physical_location: ['Unknown location.'], is_lost: ['Invalid.'] }),
      ),
    ).toEqual({ location: 'Unknown location.', status: 'Invalid.' });
  });

  it('ignores anything that is not a field map', () => {
    expect(statusFieldErrors(fieldError({ code: 'x', detail: 'y' }))).toEqual({});
    expect(statusFieldErrors(new Error('boom'))).toEqual({});
  });

  it('surfaces an unslotted field in the form-level message', () => {
    expect(saveErrorMessage(fieldError({ non_field_errors: ['Kit is in transit.'] }))).toBe(
      'Kit is in transit.',
    );
    // A field that does have a slot is shown there, not twice.
    expect(saveErrorMessage(fieldError({ notes: ['Too long.'] }))).toBe(
      'Something went wrong. Please try again.',
    );
  });
});

describe('withCurrentLocation', () => {
  it('keeps the kit’s own location selectable when the facets lack it', () => {
    expect(withCurrentLocation(['Warehouse'], 'Rep Vehicle')).toEqual(['Warehouse', 'Rep Vehicle']);
    expect(withCurrentLocation(['Warehouse'], 'Warehouse')).toEqual(['Warehouse']);
    expect(withCurrentLocation(['Warehouse'], null)).toEqual(['Warehouse']);
    expect(withCurrentLocation(['Warehouse'], '  ')).toEqual(['Warehouse']);
  });
});

describe('save state predicates', () => {
  const base: SaveState = { pendingPatch: null, pendingOps: [], failedOps: [], error: null };
  const op = { kind: 'delete', id: 'photo:7', photoId: 7 } as const;

  it('is complete only when the patch and every op are done', () => {
    expect(isSaveComplete(base)).toBe(true);
    expect(isSaveComplete({ ...base, pendingOps: [op] })).toBe(false);
    expect(isSaveComplete({ ...base, pendingPatch: {} })).toBe(false);
  });

  it('counts a committed patch or a completed op as progress', () => {
    expect(madeProgress({ ...base, pendingPatch: {} }, base)).toBe(true);
    expect(madeProgress({ ...base, pendingOps: [op] }, base)).toBe(true);
    expect(madeProgress({ ...base, pendingOps: [op] }, { ...base, pendingOps: [op] })).toBe(false);
    expect(madeProgress({ ...base, pendingPatch: {} }, { ...base, pendingPatch: {} })).toBe(false);
  });
});
