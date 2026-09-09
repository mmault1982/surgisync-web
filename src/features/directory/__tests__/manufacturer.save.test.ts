import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Company } from '@/api/generated/model';
import { server } from '@/test/msw/server';

import { initialManufacturerValues, seedManufacturerValues } from '../manufacturer-form';
import {
  initialManufacturerSaveState,
  isHalfSaved,
  isManufacturerSaveComplete,
  madeManufacturerProgress,
  runManufacturerSave,
} from '../manufacturer.save';

import { companyFixture, manufacturerDetailFixture } from './manufacturer-fixture';

/**
 * The save sequence, driven directly.
 *
 * The role write then the company write, and the latch that stops the first one
 * happening twice, are the two requirements most worth pinning down, and
 * neither needs a rendered form — asserting them here keeps the component test
 * about the component.
 */

const MANUFACTURERS = '/api/v1/directory/manufacturers/';
const COMPANY = '/api/v1/directory/companies/:id/';

/** The order every request arrived in — the whole point of these tests. */
let calls: string[];
/** The company ids the contact write was addressed to. */
let companyIds: string[];

beforeEach(() => {
  calls = [];
  companyIds = [];
  server.use(
    http.post(MANUFACTURERS, async ({ request }) => {
      calls.push('POST manufacturer');
      const body = (await request.json()) as { name: string };
      return HttpResponse.json(manufacturerDetailFixture({ id: 99, name: body.name }), {
        status: 201,
      });
    }),
    http.patch(`${MANUFACTURERS}:id/`, async ({ request }) => {
      calls.push('PATCH manufacturer');
      const body = (await request.json()) as { name: string };
      return HttpResponse.json(manufacturerDetailFixture({ name: body.name }));
    }),
    http.patch(COMPANY, async ({ request, params }) => {
      calls.push('PATCH company');
      companyIds.push(String(params.id));
      return HttpResponse.json(companyFixture((await request.json()) as Partial<Company>));
    }),
  );
});

const withValues = (over: Partial<ReturnType<typeof initialManufacturerValues>> = {}) => ({
  ...initialManufacturerValues(),
  ...over,
});

describe('creating', () => {
  it('posts the manufacturer, then patches the company it answered with', async () => {
    const before = initialManufacturerSaveState(
      withValues({ name: 'Beta Devices', contact_email: 'a@b.co' }),
      null,
    );

    const after = await runManufacturerSave(before);

    expect(calls).toEqual(['POST manufacturer', 'PATCH company']);
    // The company's id off the 201 body — 17, not the manufacturer's 99. This
    // is the assertion the differing fixture ids exist for.
    expect(companyIds).toEqual(['17']);
    expect(isManufacturerSaveComplete(after)).toBe(true);
    expect(after.saved?.id).toBe(99);
  });

  it('sends one request when no contact field was filled in', async () => {
    const before = initialManufacturerSaveState(withValues({ name: 'Beta Devices' }), null);

    await runManufacturerSave(before);

    // `POST {name}` already creates the Company with blank contacts, so a
    // `PATCH {}` would write nothing. Adding a manufacturer stays exactly as
    // cheap as it was before this form grew ten fields.
    expect(calls).toEqual(['POST manufacturer']);
  });

  it('does not touch the company when the post fails', async () => {
    server.use(
      http.post(MANUFACTURERS, () => {
        calls.push('POST manufacturer');
        return HttpResponse.json({ name: ['Already taken.'] }, { status: 400 });
      }),
    );
    const before = initialManufacturerSaveState(
      withValues({ name: 'Acme Ortho', phone: '555' }),
      null,
    );

    const after = await runManufacturerSave(before);

    expect(calls).toEqual(['POST manufacturer']);
    // Nothing was written, so nothing is latched and the form stays fully
    // editable — the 400's `name` key has an input to land under.
    expect(after.pendingName).toBe('Acme Ortho');
    expect(after.saved).toBeNull();
    expect(isHalfSaved(after)).toBe(false);
  });
});

describe('when the company write fails after the role write landed', () => {
  beforeEach(() => {
    server.use(
      http.patch(COMPANY, () => {
        calls.push('PATCH company');
        return HttpResponse.json(
          { contact_email: ['Enter a valid email address.'] },
          { status: 400 },
        );
      }),
    );
  });

  it('keeps the created manufacturer and says which half landed', async () => {
    const before = initialManufacturerSaveState(
      withValues({ name: 'Beta Devices', contact_email: 'nope' }),
      null,
    );

    const after = await runManufacturerSave(before);

    expect(after.saved?.id).toBe(99);
    expect(after.pendingName).toBeNull();
    expect(isHalfSaved(after)).toBe(true);
    // Invalidation is gated on progress, not completion: the row exists, so the
    // table and the Receive picker are stale whether or not the rest followed.
    expect(madeManufacturerProgress(before, after)).toBe(true);
  });

  it('retries only the company write, never a second post', async () => {
    const first = await runManufacturerSave(
      initialManufacturerSaveState(
        withValues({ name: 'Beta Devices', contact_email: 'nope' }),
        null,
      ),
    );
    calls = [];
    server.resetHandlers();
    server.use(
      http.post(MANUFACTURERS, () => {
        calls.push('POST manufacturer');
        return HttpResponse.json(manufacturerDetailFixture({ id: 123 }), { status: 201 });
      }),
      http.patch(COMPANY, async ({ request }) => {
        calls.push('PATCH company');
        return HttpResponse.json(companyFixture((await request.json()) as Partial<Company>));
      }),
    );

    // The user corrects the address and submits again. The state is rebuilt
    // from the live values against the record the server gave us.
    const retry = initialManufacturerSaveState(
      withValues({ name: 'Beta Devices', contact_email: 'fixed@b.co' }),
      first.saved,
    );
    const after = await runManufacturerSave(retry);

    // The regression this whole module exists to prevent.
    expect(calls).toEqual(['PATCH company']);
    expect(after.saved?.company.contact_email).toBe('fixed@b.co');
    expect(isManufacturerSaveComplete(after)).toBe(true);
  });

  it('renames rather than reposting when the name is edited between attempts', async () => {
    const first = await runManufacturerSave(
      initialManufacturerSaveState(
        withValues({ name: 'Beta Devices', contact_email: 'nope' }),
        null,
      ),
    );
    calls = [];

    // Diffing against the saved record is what makes this safe: the row now
    // exists, so a changed name is a rename of it rather than a second create.
    const retry = initialManufacturerSaveState(
      withValues({ name: 'Beta Devices Inc', contact_email: 'nope' }),
      first.saved,
    );
    await runManufacturerSave(retry);

    expect(calls).toEqual(['PATCH manufacturer', 'PATCH company']);
  });
});

describe('amending', () => {
  const record = manufacturerDetailFixture({
    company: companyFixture({ phone: '555-0100', contact_email: 'old@b.co' }),
  });

  it('sends only the rename when the contact block is untouched', async () => {
    const values = { ...seedManufacturerValues(record), name: 'Acme Orthopaedics' };

    await runManufacturerSave(initialManufacturerSaveState(values, record));

    expect(calls).toEqual(['PATCH manufacturer']);
  });

  it('sends only the changed contact keys when the name is untouched', async () => {
    let body: unknown;
    server.use(
      http.patch(COMPANY, async ({ request }) => {
        calls.push('PATCH company');
        body = await request.json();
        return HttpResponse.json(companyFixture());
      }),
    );
    const values = { ...seedManufacturerValues(record), contact_email: 'new@b.co' };

    await runManufacturerSave(initialManufacturerSaveState(values, record));

    expect(calls).toEqual(['PATCH company']);
    // Not all ten. `Company` is shared between an organization's roles, so a
    // full-document PATCH from a form seeded minutes ago would revert whatever
    // another admin had changed in the meantime.
    expect(body).toEqual({ contact_email: 'new@b.co' });
  });

  it('sends a cleared field as a blank rather than omitting it', async () => {
    let body: unknown;
    server.use(
      http.patch(COMPANY, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(companyFixture());
      }),
    );
    const values = { ...seedManufacturerValues(record), phone: '' };

    await runManufacturerSave(initialManufacturerSaveState(values, record));

    // Omitting the key would leave the old value in place, which is the
    // opposite of what an emptied field means.
    expect(body).toEqual({ phone: '' });
  });

  it('sends nothing at all when neither half changed', async () => {
    const state = initialManufacturerSaveState(seedManufacturerValues(record), record);

    expect(isManufacturerSaveComplete(state)).toBe(true);
    await runManufacturerSave(state);

    expect(calls).toEqual([]);
  });
});
