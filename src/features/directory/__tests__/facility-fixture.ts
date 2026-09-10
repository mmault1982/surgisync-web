import type { FacilityCatalog, FacilityDetail } from '@/api/generated/model';

import { companyFixture } from './company-fixture';

/**
 * A facility, as the list renders it and as the detail read answers it.
 *
 * **`id` is 41 and `company.id` is 17**, for the reason `company-fixture.ts`
 * gives: the contact and address writes are addressed by the company's id, and
 * a fixture that made the two equal would pass for a client that confused
 * them.
 *
 * Active and owned by default, so the write-control tests use rows the server
 * would accept a write on. The deactivated case is `{ is_active: false }`.
 */
export function facilityCatalogFixture(overrides: Partial<FacilityCatalog> = {}): FacilityCatalog {
  return {
    id: 41,
    name: 'Mercy General Hospital',
    facility_type: 'hospital',
    onboarding_status: 'not_started',
    is_active: true,
    is_owned: true,
    ...overrides,
  };
}

export function facilityDetailFixture(overrides: Partial<FacilityDetail> = {}): FacilityDetail {
  return {
    ...facilityCatalogFixture(),
    gpo_affiliation: '',
    gpo_member_id: '',
    idn_affiliation: '',
    npi_number: '',
    tax_id: '',
    dea_number: '',
    state_license_number: '',
    // Null, not '' — these are the two nullable dates, and a fixture that used
    // '' would hide the conversion the form has to make in both directions.
    state_license_expiration: null,
    accreditation_status: '',
    accreditation_expiration: null,
    notes: '',
    company: companyFixture(),
    ...overrides,
  };
}
