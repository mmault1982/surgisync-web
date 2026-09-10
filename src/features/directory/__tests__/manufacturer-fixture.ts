import type { ManufacturerDetail } from '@/api/generated/model';

import { companyFixture } from './company-fixture';

/**
 * A manufacturer and the company behind it.
 *
 * **`id` and `company.id` differ deliberately, and never by accident.** The
 * address and contact writes are addressed by the *company's* id, and the two
 * are unrelated integers — a client that reused the manufacturer's would work
 * against any fixture that made them equal.
 *
 * `companyFixture` and `addressFixture` live in `company-fixture.ts` now,
 * because the facility suite needs the same two.
 */
export function manufacturerDetailFixture(
  overrides: Partial<ManufacturerDetail> = {},
): ManufacturerDetail {
  return {
    id: 7,
    name: 'Acme Ortho',
    barcode: null,
    is_owned: true,
    company: companyFixture(),
    ...overrides,
  };
}

export { addressFixture, companyFixture } from './company-fixture';
