import type { Address, Company } from '@/api/generated/model';

/**
 * The shared `Company` identity, and one of its addresses.
 *
 * Split out of `manufacturer-fixture.ts` when Facilities became the second
 * role to write these — the same move `company-form.ts` records on the source
 * side.
 *
 * **`Company.id` is 17 and never a role's id.** Every role fixture in this
 * directory deliberately carries a different one (a manufacturer is 7, a
 * facility 41), because the address and contact writes are addressed by the
 * *company's* id and the two are unrelated integers. A client that reused the
 * role's would work against any fixture that made them equal.
 */
export function companyFixture(overrides: Partial<Company> = {}): Company {
  return {
    id: 17,
    phone: '',
    fax: '',
    email: '',
    contact_name: '',
    contact_title: '',
    contact_email: '',
    contact_phone: '',
    billing_contact_name: '',
    billing_contact_email: '',
    billing_contact_phone: '',
    addresses: [],
    ...overrides,
  };
}

export function addressFixture(overrides: Partial<Address> = {}): Address {
  return {
    id: 88,
    kind: 'physical',
    is_primary: false,
    label: '',
    address_line_1: '1 Mill Road',
    address_line_2: '',
    city: 'Bloomington',
    state: 'IN',
    zip_code: '47401',
    country: 'US',
    contact_name: '',
    phone: '',
    instructions: '',
    ...overrides,
  };
}
