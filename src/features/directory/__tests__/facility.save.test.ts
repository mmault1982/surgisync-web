import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { server } from '@/test/msw/server';

import { initialFacilityValues, seedFacilityValues, type FacilityValues } from '../facility-form';
import {
  initialFacilitySaveState,
  isFacilityHalfSaved,
  isFacilitySaveComplete,
  madeFacilityProgress,
  runFacilitySave,
} from '../facility.save';

import { companyFixture } from './company-fixture';
import { facilityDetailFixture } from './facility-fixture';

/**
 * The save sequencer, driven directly.
 *
 * No DOM: the ordering and the latch are the two things most worth testing,
 * and neither needs one. `manufacturer.save.test.ts` is the same shape.
 */

const FACILITIES = '/api/v1/directory/facilities/';
const FACILITY = '/api/v1/directory/facilities/:id/';
const COMPANY = '/api/v1/directory/companies/:id/';

let calls: string[];
let posted: unknown[];
let patchedFacility: { id: string; body: unknown }[];
let patchedCompany: { id: string; body: unknown }[];

/** Both writes succeed, and the server echoes what it was given. */
function happyPath() {
  server.use(
    http.post(FACILITIES, async ({ request }) => {
      calls.push('POST facility');
      const body = (await request.json()) as Record<string, unknown>;
      posted.push(body);
      return HttpResponse.json(facilityDetailFixture(body), { status: 201 });
    }),
    http.patch(FACILITY, async ({ request, params }) => {
      calls.push('PATCH facility');
      const body = (await request.json()) as Record<string, unknown>;
      patchedFacility.push({ id: String(params.id), body });
      return HttpResponse.json(facilityDetailFixture(body));
    }),
    http.patch(COMPANY, async ({ request, params }) => {
      calls.push('PATCH company');
      const body = (await request.json()) as Record<string, unknown>;
      patchedCompany.push({ id: String(params.id), body });
      return HttpResponse.json(companyFixture(body));
    }),
  );
}

beforeEach(() => {
  calls = [];
  posted = [];
  patchedFacility = [];
  patchedCompany = [];
});

const creating = (overrides: Partial<FacilityValues> = {}): FacilityValues => ({
  ...initialFacilityValues(),
  name: 'Mercy General Hospital',
  ...overrides,
});

describe('creating', () => {
  it('posts the facility, then patches the company it answered with', async () => {
    happyPath();

    const after = await runFacilitySave(
      initialFacilitySaveState(creating({ contact_email: 'ops@mercy.test' }), null),
    );

    expect(calls).toEqual(['POST facility', 'PATCH company']);
    // The **company's** id, off the record — not the facility's 41.
    expect(patchedCompany).toEqual([{ id: '17', body: { contact_email: 'ops@mercy.test' } }]);
    expect(isFacilitySaveComplete(after)).toBe(true);
  });

  it('sends one request when no contact field was filled in', async () => {
    happyPath();

    await runFacilitySave(initialFacilitySaveState(creating(), null));

    expect(calls).toEqual(['POST facility']);
  });

  it('leaves the company untouched when the POST fails', async () => {
    server.use(
      http.post(FACILITIES, () => {
        calls.push('POST facility');
        return HttpResponse.json({ name: ['That name is taken.'] }, { status: 400 });
      }),
    );

    const before = initialFacilitySaveState(creating({ contact_email: 'ops@mercy.test' }), null);
    const after = await runFacilitySave(before);

    expect(calls).toEqual(['POST facility']);
    expect(after.error).toBeTruthy();
    expect(after.saved).toBeNull();
    // Nothing was written, so nothing is latched and the form stays editable.
    expect(after.pendingCreate).not.toBeNull();
    expect(madeFacilityProgress(before, after)).toBe(false);
    expect(isFacilityHalfSaved(after)).toBe(false);
  });

  it('reports a half-save when the facility lands and the contacts do not', async () => {
    server.use(
      http.post(FACILITIES, async ({ request }) => {
        calls.push('POST facility');
        return HttpResponse.json(
          facilityDetailFixture((await request.json()) as Record<string, unknown>),
          { status: 201 },
        );
      }),
      http.patch(COMPANY, () => {
        calls.push('PATCH company');
        return HttpResponse.json(
          { contact_email: ['Enter a valid email address.'] },
          {
            status: 400,
          },
        );
      }),
    );

    const before = initialFacilitySaveState(creating({ contact_email: 'ops@mercy' }), null);
    const after = await runFacilitySave(before);

    expect(calls).toEqual(['POST facility', 'PATCH company']);
    expect(isFacilityHalfSaved(after)).toBe(true);
    // The row that survives is the correct one — and there is no un-create
    // here in any case: DELETE on this resource deactivates.
    expect(after.saved?.name).toBe('Mercy General Hospital');
    expect(madeFacilityProgress(before, after)).toBe(true);
  });

  it('never posts a second facility on retry', async () => {
    // The failure mode this whole module exists to prevent: the obvious
    // response to a half-failure is to resubmit, and a second POST would be
    // refused for the name the first one just took — with the real problem
    // still unfixed.
    let companyAttempts = 0;
    server.use(
      http.post(FACILITIES, async ({ request }) => {
        calls.push('POST facility');
        return HttpResponse.json(
          facilityDetailFixture((await request.json()) as Record<string, unknown>),
          { status: 201 },
        );
      }),
      http.patch(COMPANY, async ({ request }) => {
        calls.push('PATCH company');
        companyAttempts += 1;
        const body = (await request.json()) as Record<string, unknown>;
        if (companyAttempts === 1) {
          return HttpResponse.json(
            { contact_email: ['Enter a valid email address.'] },
            {
              status: 400,
            },
          );
        }
        patchedCompany.push({ id: '17', body });
        return HttpResponse.json(companyFixture(body));
      }),
    );

    const values = creating({ contact_email: 'ops@mercy' });
    const first = await runFacilitySave(initialFacilitySaveState(values, null));

    // The user corrects the address and presses the button again. The state is
    // rebuilt from the live values against the record the server last gave us.
    const corrected = { ...values, contact_email: 'ops@mercy.test' };
    const second = await runFacilitySave(initialFacilitySaveState(corrected, first.saved));

    expect(calls).toEqual(['POST facility', 'PATCH company', 'PATCH company']);
    expect(patchedCompany).toEqual([{ id: '17', body: { contact_email: 'ops@mercy.test' } }]);
    expect(isFacilitySaveComplete(second)).toBe(true);
  });
});

describe('amending', () => {
  const record = facilityDetailFixture();

  it('patches only the facility keys that changed', async () => {
    happyPath();

    await runFacilitySave(
      initialFacilitySaveState({ ...seedFacilityValues(record), tax_id: '35-1234567' }, record),
    );

    expect(calls).toEqual(['PATCH facility']);
    expect(patchedFacility).toEqual([{ id: '41', body: { tax_id: '35-1234567' } }]);
  });

  it('sends both requests when both halves changed, role first', async () => {
    happyPath();

    await runFacilitySave(
      initialFacilitySaveState(
        { ...seedFacilityValues(record), name: 'Mercy General', phone: '555-0100' },
        record,
      ),
    );

    expect(calls).toEqual(['PATCH facility', 'PATCH company']);
  });

  it('sends nothing when neither half changed', async () => {
    happyPath();

    const after = await runFacilitySave(
      initialFacilitySaveState(seedFacilityValues(record), record),
    );

    expect(calls).toEqual([]);
    expect(isFacilitySaveComplete(after)).toBe(true);
  });

  it('clears a licence expiry with null', async () => {
    happyPath();
    const dated = facilityDetailFixture({ state_license_expiration: '2027-03-01' });

    await runFacilitySave(
      initialFacilitySaveState(
        { ...seedFacilityValues(dated), state_license_expiration: '' },
        dated,
      ),
    );

    expect(patchedFacility).toEqual([{ id: '41', body: { state_license_expiration: null } }]);
  });
});
