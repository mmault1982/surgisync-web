import type { Address, Company, ManufacturerDetail } from '@/api/generated/model';

/**
 * A manufacturer and the company behind it.
 *
 * **`id` and `company.id` differ deliberately, and never by accident.** The
 * address and contact writes are addressed by the *company's* id, and the two
 * are unrelated integers — a client that reused the manufacturer's would work
 * against any fixture that made them equal.
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
