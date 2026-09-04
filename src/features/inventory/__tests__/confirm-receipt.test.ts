import { describe, expect, it } from 'vitest';

import {
  confirmCopy,
  destinationName,
  isReturnToManufacturer,
  originName,
  transferFacts,
  transferPhotos,
} from '../confirm-receipt';

import { transferFixture } from './kit-fixture';

/**
 * `isReturnToManufacturer` is the rule with teeth here: it decides whether
 * confirming hands the kit over or deletes it, and the dialog's copy and its
 * navigation both hang off it.
 */
describe('isReturnToManufacturer', () => {
  it('is false for an ordinary transfer to a facility', () => {
    expect(isReturnToManufacturer(transferFixture())).toBe(false);
  });

  it('is false for an ordinary transfer to a representative', () => {
    const transfer = transferFixture({
      to_assigned_to_facility: null,
      to_facility_name: null,
      to_assigned_to_representative: 5,
      to_representative_name: 'Sarah Johnson',
    });

    expect(isReturnToManufacturer(transfer)).toBe(false);
  });

  it('is true for a return naming only an organization', () => {
    // The case the backend's own check allows and a naive reading misses: a
    // return may name a destination *org* and still be a return.
    const transfer = transferFixture({
      reason: 'return',
      to_assigned_to_facility: null,
      to_facility_name: null,
      to_assigned_to_parent_company: 1,
      to_parent_company_name: 'Hoosier OsteoTronix',
    });

    expect(isReturnToManufacturer(transfer)).toBe(true);
  });

  it('is true for a return naming nothing at all', () => {
    const transfer = transferFixture({
      reason: 'return',
      to_assigned_to_facility: null,
      to_facility_name: null,
    });

    expect(isReturnToManufacturer(transfer)).toBe(true);
  });

  it('is false for reason=return that still names a facility', () => {
    // Reason alone does not make a return: this one hands the kits to a real
    // holder, so confirming it must not warn that they are leaving inventory.
    expect(isReturnToManufacturer(transferFixture({ reason: 'return' }))).toBe(false);
  });
});

describe('route names', () => {
  it('prefers the most specific end of each side', () => {
    const transfer = transferFixture();

    expect(originName(transfer)).toBe('John Smith');
    expect(destinationName(transfer)).toBe("St Mary's Hospital");
  });

  it('falls back to the organization when that is all there is', () => {
    const transfer = transferFixture({
      to_assigned_to_facility: null,
      to_facility_name: null,
      to_parent_company_name: 'Hoosier OsteoTronix',
    });

    expect(destinationName(transfer)).toBe('Hoosier OsteoTronix');
  });

  it('is null when a side names nobody', () => {
    const transfer = transferFixture({
      from_assigned_to_representative: null,
      from_representative_name: null,
    });

    expect(originName(transfer)).toBeNull();
  });
});

describe('transferFacts', () => {
  it('labels the enums rather than printing their wire values', () => {
    const facts = transferFacts(transferFixture());

    expect(facts).toEqual([
      { label: 'Reason', value: 'Surgery' },
      { label: 'Transport', value: 'FedEx' },
      // `MM-DD-YYYY`, which is the prototype's format and what every other
      // calendar date in this app renders as.
      { label: 'Sent', value: '04-22-2026' },
    ]);
  });

  it('shows a placeholder rather than a blank for a missing date', () => {
    const facts = transferFacts(transferFixture({ transfer_date: null }));

    expect(facts.find((fact) => fact.label === 'Sent')?.value).toBe('—');
  });
});

describe('confirmCopy', () => {
  it('names the destination for an ordinary transfer, and keeps the kit', () => {
    const copy = confirmCopy(transferFixture());

    expect(copy.action).toBe('Confirm Receipt');
    expect(copy.detail).toContain("St Mary's Hospital");
    expect(copy.removesKit).toBe(false);
  });

  it('warns that a return removes the kit', () => {
    const copy = confirmCopy(
      transferFixture({ reason: 'return', to_assigned_to_facility: null, to_facility_name: null }),
    );

    expect(copy.action).toBe('Confirm Return');
    expect(copy.detail).toMatch(/removes this kit from your inventory/i);
    expect(copy.removesKit).toBe(true);
  });

  it('still reads sensibly when the destination has no name', () => {
    const copy = confirmCopy(
      transferFixture({ to_assigned_to_facility: 7, to_facility_name: null }),
    );

    expect(copy.detail).not.toContain('null');
    expect(copy.removesKit).toBe(false);
  });
});

/**
 * The dispatch photos.
 *
 * The rule worth pinning is that a missing photo is dropped rather than tiled:
 * a rep hand-carrying a kit is never asked for a shipping label, so an empty
 * second tile would be reporting an absence that is not one.
 */
describe('transferPhotos', () => {
  const NOW = new Date('2026-04-22T12:00:00Z');

  it('returns both photos, kit first, each labelled', () => {
    const photos = transferPhotos(
      transferFixture({
        kit_photo: 'https://example.test/kit.png',
        label_photo: 'https://example.test/label.png',
      }),
      NOW,
    );

    expect(photos.map((photo) => photo.label)).toEqual(['Kit Photo', 'Shipping Label']);
    expect(photos.map((photo) => photo.url)).toEqual([
      'https://example.test/kit.png',
      'https://example.test/label.png',
    ]);
  });

  it("captions both with the transfer's own timestamp", () => {
    const photos = transferPhotos(
      transferFixture({
        kit_photo: 'https://example.test/kit.png',
        label_photo: 'https://example.test/label.png',
      }),
      NOW,
    );

    // Local zone, and newer ICU separates the meridiem with U+202F.
    expect(photos[0]?.takenAt).toMatch(/^Apr 2[12], \d{1,2}:\d{2}\s[AP]M$/);
    expect(photos[1]?.takenAt).toBe(photos[0]?.takenAt);
  });

  it('drops the shipping label a rep transfer never had', () => {
    const photos = transferPhotos(
      transferFixture({ kit_photo: 'https://example.test/kit.png', label_photo: null }),
      NOW,
    );

    expect(photos).toHaveLength(1);
    expect(photos[0]?.label).toBe('Kit Photo');
  });

  it('is empty for a transfer carrying no photos at all', () => {
    expect(transferPhotos(transferFixture(), NOW)).toEqual([]);
  });

  it('still tiles a photo when the server sent no timestamp', () => {
    const photos = transferPhotos(
      transferFixture({ kit_photo: 'https://example.test/kit.png', created_at: null }),
      NOW,
    );

    expect(photos).toHaveLength(1);
    expect(photos[0]?.takenAt).toBeNull();
  });
});
