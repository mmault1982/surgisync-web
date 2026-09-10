import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '@/test/msw/server';

import { FacilityFormScreen } from '../components/facility-form-screen';

import { companyFixture } from './company-fixture';
import { facilityDetailFixture } from './facility-fixture';

beforeAll(() => {
  // Radix measures its trigger and calls pointer-capture methods on open;
  // jsdom implements neither. This form has three Selects and two Popovers.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

const FACILITIES = '/api/v1/directory/facilities/';
const FACILITY = '/api/v1/directory/facilities/:id/';
const COMPANY = '/api/v1/directory/companies/:id/';

let calls: string[];
let posted: Record<string, unknown>[];
let patchedFacility: Record<string, unknown>[];
let patchedCompany: { id: string; body: Record<string, unknown> }[];

beforeEach(() => {
  calls = [];
  posted = [];
  patchedFacility = [];
  patchedCompany = [];
  server.use(
    http.post(FACILITIES, async ({ request }) => {
      calls.push('POST facility');
      const body = (await request.json()) as Record<string, unknown>;
      posted.push(body);
      return HttpResponse.json(facilityDetailFixture(body), { status: 201 });
    }),
    http.patch(FACILITY, async ({ request }) => {
      calls.push('PATCH facility');
      const body = (await request.json()) as Record<string, unknown>;
      patchedFacility.push(body);
      return HttpResponse.json(facilityDetailFixture(body));
    }),
    http.patch(COMPANY, async ({ request, params }) => {
      calls.push('PATCH company');
      const body = (await request.json()) as Record<string, unknown>;
      patchedCompany.push({ id: String(params.id), body });
      return HttpResponse.json(companyFixture(body));
    }),
  );
});

function renderForm(facility = null as Parameters<typeof FacilityFormScreen>[0]['facility']) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onCancel = vi.fn();
  const onSaved = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <FacilityFormScreen facility={facility} onCancel={onCancel} onSaved={onSaved} />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), onCancel, onSaved };
}

describe('the controls', () => {
  it('labels every field unambiguously across the eight groups', () => {
    renderForm();

    // Three of these would be a bare "Name" or "Email" without qualification,
    // which is ambiguous the moment anyone reaches one out of order.
    for (const label of [
      'Name',
      'Facility type',
      'GPO affiliation',
      'GPO member ID',
      'IDN affiliation',
      'NPI number',
      'Tax ID / EIN',
      'DEA number',
      'State licence number',
      'Accreditation status',
      'Internal notes',
      'Phone',
      'Fax',
      'Email',
      'Contact name',
      'Contact title',
      'Contact email',
      'Contact phone',
      'Billing name',
      'Billing email',
      'Billing phone',
    ]) {
      expect(screen.getByLabelText(new RegExp(`^${label}`))).toBeInTheDocument();
    }
  });

  it('offers no way to deactivate from the form', () => {
    // The PATCH accepts `is_active`, but standing a hospital down must not be
    // something that happens while fixing a typo.
    renderForm();

    expect(screen.queryByLabelText(/active/i)).not.toBeInTheDocument();
  });

  it('offers no onboarding status control', () => {
    // The list shows it as a column and filters on it; it is not writable from
    // this app.
    renderForm();

    expect(screen.queryByLabelText(/onboarding/i)).not.toBeInTheDocument();
  });

  it('marks the boundary at both ends of the contact block', () => {
    // The company half sits in the middle of the form now, so one divider
    // would leave the licensing groups reading as more of the organization's
    // details.
    renderForm();

    expect(
      screen.getByText(/belong to the organization behind this facility and are saved separately/),
    ).toBeInTheDocument();
    expect(screen.getByText(/rest is recorded against this facility itself/)).toBeInTheDocument();
  });

  it('says where the subject changes to the shared organization', () => {
    renderForm();

    expect(
      screen.getByText(/belong to the organization behind this facility and are saved separately/),
    ).toBeInTheDocument();
  });
});

describe('creating', () => {
  it('will not submit a blank name', async () => {
    const { user } = renderForm();

    await user.click(screen.getByRole('button', { name: 'Add facility' }));

    expect(await screen.findByText('Enter a name.')).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it('sends one request when only facility fields were filled in', async () => {
    const { user, onSaved } = renderForm();

    await user.type(screen.getByLabelText(/^Name/), 'Mercy General Hospital');
    await user.type(screen.getByLabelText(/^GPO affiliation/), 'Vizient');
    await user.click(screen.getByRole('button', { name: 'Add facility' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(calls).toEqual(['POST facility']);
    expect(posted).toMatchObject([
      {
        name: 'Mercy General Hospital',
        gpo_affiliation: 'Vizient',
        // Never `''` for a nullable date.
        state_license_expiration: null,
      },
    ]);
  });

  it('posts the facility, then patches the company it answered with', async () => {
    const { user, onSaved } = renderForm();

    await user.type(screen.getByLabelText(/^Name/), 'Mercy General Hospital');
    await user.type(screen.getByLabelText(/^Contact email/), 'ops@mercy.test');
    await user.click(screen.getByRole('button', { name: 'Add facility' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(calls).toEqual(['POST facility', 'PATCH company']);
    // The company's id, off the record the POST returned — not the facility's.
    expect(patchedCompany[0]).toEqual({ id: '17', body: { contact_email: 'ops@mercy.test' } });
  });

  it('lands a name clash under the field rather than in the form-level alert', async () => {
    server.use(
      http.post(FACILITIES, () =>
        HttpResponse.json(
          {
            name: [
              'A facility with this name already exists in your organization. Deactivated facilities keep their name.',
            ],
          },
          { status: 400 },
        ),
      ),
    );
    const { user, onSaved } = renderForm();

    await user.type(screen.getByLabelText(/^Name/), 'Mercy General Hospital');
    await user.click(screen.getByRole('button', { name: 'Add facility' }));

    expect(await screen.findByText(/already exists in your organization/)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe('a half-failed save', () => {
  beforeEach(() => {
    server.use(
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
  });

  it('says which half landed, and relabels both buttons to match', async () => {
    const { user, onSaved } = renderForm();

    await user.type(screen.getByLabelText(/^Name/), 'Mercy General Hospital');
    await user.type(screen.getByLabelText(/^Contact email/), 'ops@mercy.test');
    await user.click(screen.getByRole('button', { name: 'Add facility' }));

    // Without this, a lone field error would read as "nothing happened" — and
    // the obvious response, refilling the form and resubmitting, is the one
    // thing that must not happen.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /was saved, but its contact details were not/,
    );
    // "Cancel" would be a lie: the row exists.
    expect(
      screen.getByRole('button', { name: 'Leave without contact details' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry contact details' })).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('retries only the contact write, never a second facility', async () => {
    const { user, onSaved } = renderForm();

    await user.type(screen.getByLabelText(/^Name/), 'Mercy General Hospital');
    await user.type(screen.getByLabelText(/^Contact email/), 'ops@mercy.test');
    await user.click(screen.getByRole('button', { name: 'Add facility' }));
    await screen.findByRole('button', { name: 'Retry contact details' });

    // The user corrects the address and tries again.
    server.use(
      http.patch(COMPANY, async ({ request, params }) => {
        calls.push('PATCH company');
        patchedCompany.push({
          id: String(params.id),
          body: (await request.json()) as Record<string, unknown>,
        });
        return HttpResponse.json(companyFixture());
      }),
    );
    await user.clear(screen.getByLabelText(/^Contact email/));
    await user.type(screen.getByLabelText(/^Contact email/), 'ops@mercy.example');
    await user.click(screen.getByRole('button', { name: 'Retry contact details' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(calls).toEqual(['POST facility', 'PATCH company', 'PATCH company']);
    expect(calls.filter((call) => call === 'POST facility')).toHaveLength(1);
  });
});

describe('amending', () => {
  it('sends only what changed', async () => {
    const record = facilityDetailFixture();
    const { user, onSaved } = renderForm(record);

    await user.type(screen.getByLabelText(/^GPO member ID/), 'HT-4412');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(calls).toEqual(['PATCH facility']);
    expect(patchedFacility[0]).toEqual({ gpo_member_id: 'HT-4412' });
  });

  it('treats an untouched form as a success rather than a failure', async () => {
    const record = facilityDetailFixture();
    const { user, onSaved } = renderForm(record);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(record));
    expect(calls).toEqual([]);
  });

  it('clears a licence expiry with null', async () => {
    const record = facilityDetailFixture({ state_license_expiration: '2027-03-01' });
    const { user, onSaved } = renderForm(record);

    // The picker shows the seeded date, and the Clear button beside it is the
    // only way back to nothing — which the server needs as `null`, not `''`.
    expect(screen.getByRole('button', { name: 'Licence expires, 03-01-2027' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear licence expires' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(patchedFacility[0]).toEqual({ state_license_expiration: null });
  });

  it('offers no Clear on a date that is already empty', () => {
    renderForm(facilityDetailFixture());

    expect(screen.queryByRole('button', { name: 'Clear licence expires' })).not.toBeInTheDocument();
  });
});
