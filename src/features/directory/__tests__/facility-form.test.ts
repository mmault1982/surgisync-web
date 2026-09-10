import { describe, expect, it } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';

import {
  facilityFieldErrors,
  facilitySaveErrorMessage,
  facilitySavePlan,
  hasFacilityErrors,
  initialFacilityValues,
  isUnchanged,
  seedFacilityValues,
  validateFacility,
  type FacilityValues,
} from '../facility-form';

import { companyFixture } from './company-fixture';
import { facilityDetailFixture } from './facility-fixture';

const values = (overrides: Partial<FacilityValues> = {}): FacilityValues => ({
  ...initialFacilityValues(),
  name: 'Mercy General Hospital',
  ...overrides,
});

/** A DRF 400, as `asFieldErrors` expects to find it. */
function badRequest(fields: Record<string, string[]>) {
  const headers = new AxiosHeaders();
  return new AxiosError('Bad Request', 'ERR_BAD_REQUEST', { headers }, null, {
    status: 400,
    statusText: 'Bad Request',
    headers: {},
    config: { headers },
    data: fields,
  });
}

describe('seedFacilityValues', () => {
  it('reads the role, the company and the model defaults', () => {
    const record = facilityDetailFixture({
      facility_type: 'surgery_center',
      npi_number: '1234567890',
      company: companyFixture({ contact_email: 'ops@mercy.test' }),
    });

    const seeded = seedFacilityValues(record);

    expect(seeded.name).toBe('Mercy General Hospital');
    expect(seeded.facility_type).toBe('surgery_center');
    expect(seeded.npi_number).toBe('1234567890');
    expect(seeded.contact_email).toBe('ops@mercy.test');
  });

  it('collapses the two nullable dates to the empty box', () => {
    const seeded = seedFacilityValues(facilityDetailFixture());

    expect(seeded.state_license_expiration).toBe('');
    expect(seeded.accreditation_expiration).toBe('');
  });

  it('keeps a date it was given', () => {
    const seeded = seedFacilityValues(
      facilityDetailFixture({ state_license_expiration: '2027-03-01' }),
    );

    expect(seeded.state_license_expiration).toBe('2027-03-01');
  });
});

describe('validateFacility', () => {
  it('accepts a name and nothing else', () => {
    expect(hasFacilityErrors(validateFacility(values()))).toBe(false);
  });

  it('requires a name', () => {
    expect(validateFacility(values({ name: '   ' })).name).toBe('Enter a name.');
  });

  it('caps the name at the contract length', () => {
    expect(validateFacility(values({ name: 'x'.repeat(201) })).name).toContain('200');
  });

  it('takes an NPI of exactly ten digits, or none at all', () => {
    expect(validateFacility(values({ npi_number: '' })).npi_number).toBeUndefined();
    expect(validateFacility(values({ npi_number: '1234567890' })).npi_number).toBeUndefined();
    expect(validateFacility(values({ npi_number: '123456789' })).npi_number).toBeTruthy();
    expect(validateFacility(values({ npi_number: '12345678ab' })).npi_number).toBeTruthy();
  });

  it('takes a DEA of two letters and seven digits, or none at all', () => {
    expect(validateFacility(values({ dea_number: '' })).dea_number).toBeUndefined();
    expect(validateFacility(values({ dea_number: 'AB1234567' })).dea_number).toBeUndefined();
    // Accepted, because the builder upper-cases it — fighting the case as the
    // user types would be worse than normalising on submit.
    expect(validateFacility(values({ dea_number: 'ab1234567' })).dea_number).toBeUndefined();
    expect(validateFacility(values({ dea_number: 'A1234567' })).dea_number).toBeTruthy();
  });

  it('holds a present email to an email shape and lets a blank one be', () => {
    expect(validateFacility(values({ contact_email: '' })).contact_email).toBeUndefined();
    expect(validateFacility(values({ contact_email: 'nope' })).contact_email).toBeTruthy();
    expect(validateFacility(values({ contact_email: 'a@b.co' })).contact_email).toBeUndefined();
  });

  it('does not invent a uniqueness rule', () => {
    // Only the server can answer it — against rows this client cannot see,
    // including deactivated ones, which keep their name.
    expect(hasFacilityErrors(validateFacility(values({ name: 'Mercy General Hospital' })))).toBe(
      false,
    );
  });
});

describe('facilitySavePlan, creating', () => {
  it('sends the whole body, since there is nothing to diff against', () => {
    const plan = facilitySavePlan(values({ gpo_affiliation: 'Vizient' }), null);

    expect(plan.facilityPatch).toBeUndefined();
    expect(plan.createBody).toMatchObject({
      name: 'Mercy General Hospital',
      facility_type: 'hospital',
      accreditation_status: '',
      gpo_affiliation: 'Vizient',
    });
  });

  it('sends null for an unset date, never the empty string', () => {
    // `''` is not a valid date: the server answers 400, not "cleared".
    const plan = facilitySavePlan(values(), null);

    expect(plan.createBody?.state_license_expiration).toBeNull();
    expect(plan.createBody?.accreditation_expiration).toBeNull();
  });

  it('upper-cases the DEA number', () => {
    const plan = facilitySavePlan(values({ dea_number: 'ab1234567' }), null);

    expect(plan.createBody?.dea_number).toBe('AB1234567');
  });

  it('carries the contact fields as a separate patch', () => {
    const plan = facilitySavePlan(values({ contact_email: 'ops@mercy.test' }), null);

    expect(plan.companyPatch).toEqual({ contact_email: 'ops@mercy.test' });
  });

  it('has no company patch when no contact field was filled in', () => {
    expect(facilitySavePlan(values(), null).companyPatch).toBeUndefined();
  });
});

describe('facilitySavePlan, amending', () => {
  const record = facilityDetailFixture();

  it('sends nothing at all when nothing changed', () => {
    const plan = facilitySavePlan(seedFacilityValues(record), record);

    expect(plan).toEqual({});
    expect(isUnchanged(seedFacilityValues(record), record)).toBe(true);
  });

  it('sends only the keys that changed', () => {
    const next = { ...seedFacilityValues(record), facility_type: 'clinic' as const };

    expect(facilitySavePlan(next, record).facilityPatch).toEqual({ facility_type: 'clinic' });
  });

  it('clears a text field with the empty string rather than omitting it', () => {
    const withGpo = facilityDetailFixture({ gpo_affiliation: 'Vizient' });
    const next = { ...seedFacilityValues(withGpo), gpo_affiliation: '' };

    expect(facilitySavePlan(next, withGpo).facilityPatch).toEqual({ gpo_affiliation: '' });
  });

  it('clears a date with null rather than the empty string', () => {
    // The single likeliest bug in this feature, and it fails quietly: `''`
    // 400s, and never diffing at all silently does nothing.
    const dated = facilityDetailFixture({ state_license_expiration: '2027-03-01' });
    const next = { ...seedFacilityValues(dated), state_license_expiration: '' };

    expect(facilitySavePlan(next, dated).facilityPatch).toEqual({
      state_license_expiration: null,
    });
  });

  it('does not read an already-empty date as a change', () => {
    const next = { ...seedFacilityValues(record), state_license_expiration: '' };

    expect(facilitySavePlan(next, record).facilityPatch).toBeUndefined();
  });

  it('clears an accreditation with the empty string, not null', () => {
    // The contract declares it `oneOf: [AccreditationStatusEnum, BlankEnum]`,
    // so `''` is a legal member there and `null` is not.
    const accredited = facilityDetailFixture({ accreditation_status: 'accredited' });
    const next = { ...seedFacilityValues(accredited), accreditation_status: '' as const };

    expect(facilitySavePlan(next, accredited).facilityPatch).toEqual({
      accreditation_status: '',
    });
  });

  it('never emits is_active or onboarding_status, in either direction', () => {
    // The PATCH accepts both; neither is on this form, and `FacilityValues`
    // has no key for either. Standing a hospital down must not be something
    // that happens while fixing a typo, and onboarding status is not writable
    // from this app at all.
    const next = { ...seedFacilityValues(record), name: 'Mercy General' };
    const plan = facilitySavePlan(next, record);

    expect(plan.facilityPatch).not.toHaveProperty('is_active');
    expect(JSON.stringify(plan)).not.toContain('is_active');
    expect(JSON.stringify(plan)).not.toContain('onboarding_status');
  });

  it('leaves onboarding_status off a create body, so the model default applies', () => {
    // The server defaults it to `not_started`, which is exactly what this form
    // used to send explicitly.
    expect(facilitySavePlan(values(), null).createBody).not.toHaveProperty('onboarding_status');
  });

  it('diffs the contact block against the company, not the facility', () => {
    const withContact = facilityDetailFixture({
      company: companyFixture({ phone: '555-0100' }),
    });
    const next = { ...seedFacilityValues(withContact), phone: '555-0199' };

    expect(facilitySavePlan(next, withContact).companyPatch).toEqual({ phone: '555-0199' });
  });
});

describe('server errors', () => {
  it('routes a field the form owns to its slot', () => {
    const errors = facilityFieldErrors(
      badRequest({ name: ['A facility with this name already exists in your organization.'] }),
    );

    expect(errors.name).toContain('already exists');
  });

  it('routes a contact field to its slot too', () => {
    expect(
      facilityFieldErrors(badRequest({ contact_email: ['Enter a valid email address.'] }))
        .contact_email,
    ).toBeTruthy();
  });

  it('lets a key with no control fall through to the form-level alert', () => {
    const error = badRequest({
      non_field_errors: ['You must belong to an organization to add a facility.'],
    });

    expect(facilityFieldErrors(error)).toEqual({});
    expect(facilitySaveErrorMessage(error)).toBe(
      'You must belong to an organization to add a facility.',
    );
  });

  it('does not repeat in the alert what a field already shows', () => {
    const error = badRequest({ name: ['That name is taken.'] });

    expect(facilityFieldErrors(error).name).toBe('That name is taken.');
    expect(facilitySaveErrorMessage(error)).not.toBe('That name is taken.');
  });
});
