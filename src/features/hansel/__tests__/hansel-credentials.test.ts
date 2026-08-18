import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';

import {
  buildCredentialCreateBody,
  buildCredentialPatch,
  credentialFieldErrors,
  credentialSaveErrorMessage,
  hasCredentialErrors,
  initialCredentialValues,
  resolveOrganization,
  validateHanselCredential,
  type HanselCredentialValues,
} from '../hansel-credentials';

import { credentialFixture, organizationFixture, userFixture } from './credential-fixture';

const WORKSPACE = '3f1c9e2a-5b6d-4f7a-8c9d-0e1f2a3b4c5d';

function values(overrides: Partial<HanselCredentialValues> = {}): HanselCredentialValues {
  return {
    organizationId: '7',
    clientId: 'hansel-client-abc',
    clientSecret: 'a-long-enough-secret',
    workspaceId: WORKSPACE,
    isActive: true,
    ...overrides,
  };
}

function axiosError(data: unknown, status: number) {
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

describe('validateHanselCredential', () => {
  it('accepts a complete set', () => {
    expect(validateHanselCredential(values(), 'create')).toEqual({});
    expect(hasCredentialErrors(validateHanselCredential(values(), 'create'))).toBe(false);
  });

  it('names each missing field separately', () => {
    const errors = validateHanselCredential(
      values({ clientId: '   ', clientSecret: '', workspaceId: '' }),
      'create',
    );

    expect(errors.clientId).toBeTruthy();
    expect(errors.clientSecret).toBeTruthy();
    expect(errors.workspaceId).toBeTruthy();
  });

  it('rejects a secret the server would reject', () => {
    // min_length=8 on the serializer. Catching it here means the user is told
    // by the field rather than by a round trip.
    expect(
      validateHanselCredential(values({ clientSecret: '1234567' }), 'create').clientSecret,
    ).toBeTruthy();
    expect(
      validateHanselCredential(values({ clientSecret: '12345678' }), 'create').clientSecret,
    ).toBeUndefined();
  });

  it('treats a blank secret as "keep the stored one" only when editing', () => {
    // The whole reason validation takes a mode. On create the same blank is the
    // one value the server cannot supply for itself.
    expect(validateHanselCredential(values({ clientSecret: '' }), 'edit')).toEqual({});
    expect(
      validateHanselCredential(values({ clientSecret: '' }), 'create').clientSecret,
    ).toBeTruthy();
  });

  it('still checks a secret that is present while editing', () => {
    expect(
      validateHanselCredential(values({ clientSecret: 'short' }), 'edit').clientSecret,
    ).toBeTruthy();
  });

  it('rejects a workspace id that is not a UUID', () => {
    expect(
      validateHanselCredential(values({ workspaceId: 'my-workspace' }), 'create').workspaceId,
    ).toBeTruthy();
  });

  it('accepts every spelling of a UUID the server accepts', () => {
    // DRF's UUIDField parses all of these. A stricter client-side pattern would
    // block a save the server would have taken.
    for (const spelling of [
      WORKSPACE,
      WORKSPACE.toUpperCase(),
      WORKSPACE.replaceAll('-', ''),
      `{${WORKSPACE}}`,
      `urn:uuid:${WORKSPACE}`,
    ]) {
      expect(
        validateHanselCredential(values({ workspaceId: spelling }), 'create').workspaceId,
      ).toBeUndefined();
    }
  });

  it('catches a workspace this organization already holds', () => {
    // Left to the server this comes back as DRF's own default — "The fields
    // parent_company, workspace_id must make a unique set." — which names
    // database columns at a customer.
    const errors = validateHanselCredential(values(), 'create', [WORKSPACE]);

    expect(errors.workspaceId).toMatch(/already has credentials/i);
  });

  it('matches a taken workspace across UUID spellings', () => {
    // The stored value is canonical; a user may paste the braced or bare form.
    expect(
      validateHanselCredential(values({ workspaceId: WORKSPACE.replaceAll('-', '') }), 'create', [
        WORKSPACE,
      ]).workspaceId,
    ).toBeTruthy();
  });

  it('does not report a workspace as a duplicate of itself', () => {
    // The section excludes the row being edited; with that done, saving an
    // unchanged form is valid.
    expect(validateHanselCredential(values(), 'edit', []).workspaceId).toBeUndefined();
  });

  it('asks for an organization when none was resolved', () => {
    expect(
      validateHanselCredential(values({ organizationId: '' }), 'create').organization,
    ).toBeTruthy();
  });
});

describe('initialCredentialValues', () => {
  it('seeds an edit from the stored credential, but never the secret', () => {
    const seeded = initialCredentialValues(null, credentialFixture());

    expect(seeded.clientId).toBe('hansel-client-abc');
    expect(seeded.workspaceId).toBe(WORKSPACE);
    expect(seeded.organizationId).toBe('7');
    // The server has never sent the secret. A placeholder here would be a value
    // the user could submit by accident.
    expect(seeded.clientSecret).toBe('');
  });

  it('defaults a new credential to active', () => {
    expect(initialCredentialValues(7).isActive).toBe(true);
  });
});

describe('buildCredentialCreateBody', () => {
  it('sends the five fields the create endpoint declares, trimmed', () => {
    expect(
      buildCredentialCreateBody(
        values({ clientId: '  hansel-client-abc  ', clientSecret: '  a-long-enough-secret  ' }),
      ),
    ).toEqual({
      parent_company: 7,
      client_id: 'hansel-client-abc',
      workspace_id: WORKSPACE,
      client_secret: 'a-long-enough-secret',
      is_active: true,
    });
  });
});

describe('buildCredentialPatch', () => {
  it('omits client_secret entirely when the field is blank', () => {
    // The assertion this file exists for. The server reads an absent key as
    // "keep the stored secret" and a present one as "replace it" — so sending
    // `''` would swap a working credential for one that cannot authenticate,
    // and nothing on screen would say so until the next check failed.
    const patch = buildCredentialPatch(values({ clientSecret: '   ' }));

    expect(patch).not.toHaveProperty('client_secret');
    expect(patch).toEqual({
      client_id: 'hansel-client-abc',
      workspace_id: WORKSPACE,
      is_active: true,
    });
  });

  it('sends client_secret when one was typed', () => {
    expect(buildCredentialPatch(values({ clientSecret: 'a-new-secret' })).client_secret).toBe(
      'a-new-secret',
    );
  });

  it('never sends parent_company', () => {
    // The serializer rejects any PATCH naming a different organization. Leaving
    // the key out makes that 400 unreachable rather than merely unlikely.
    expect(buildCredentialPatch(values())).not.toHaveProperty('parent_company');
  });
});

describe('credentialFieldErrors', () => {
  it('folds each rejected field onto its own control', () => {
    const errors = credentialFieldErrors(
      axiosError(
        {
          client_id: ['This field may not be blank.'],
          client_secret: ['Ensure this field has at least 8 characters.'],
          workspace_id: ['Must be a valid UUID.'],
        },
        400,
      ),
    );

    expect(errors).toEqual({
      clientId: 'This field may not be blank.',
      clientSecret: 'Ensure this field has at least 8 characters.',
      workspaceId: 'Must be a valid UUID.',
    });
  });

  it('claims no slot for keys the form has no control for', () => {
    expect(
      credentialFieldErrors(axiosError({ non_field_errors: ['Already exists.'] }, 400)),
    ).toEqual({});
    // parent_company is deliberately unslotted: the single-organization form
    // does not render a control it could attach to.
    expect(credentialFieldErrors(axiosError({ parent_company: ['No org.'] }, 400))).toEqual({});
  });

  it('reads nothing off a status that is not a 400 field map', () => {
    expect(credentialFieldErrors(axiosError({ detail: 'Nope.' }, 403))).toEqual({});
  });
});

describe('credentialSaveErrorMessage', () => {
  it('surfaces the duplicate-workspace sentence verbatim', () => {
    // DRF derives this from the model's partial unique constraint, and its
    // wording already says what to do instead.
    expect(
      credentialSaveErrorMessage(
        axiosError(
          {
            non_field_errors: [
              'This organization already has credentials for that Hansel workspace. Update them instead.',
            ],
          },
          400,
        ),
      ),
    ).toMatch(/already has credentials/);
  });

  it('surfaces a parent_company message the form cannot show under a field', () => {
    expect(
      credentialSaveErrorMessage(
        axiosError({ parent_company: ['Your account is not linked to an organization.'] }, 400),
      ),
    ).toBe('Your account is not linked to an organization.');
  });

  it('says nothing when every message already has a field to live under', () => {
    // A generic "something went wrong" above three specific, correct field
    // errors tells the user less than the fields already did.
    expect(credentialSaveErrorMessage(axiosError({ client_id: ['Too long.'] }, 400))).toBeNull();
  });

  it('explains a coded 503 rather than promising a retry will work', () => {
    const message = credentialSaveErrorMessage(
      axiosError({ error: 'encryption_unavailable', message: 'Contact an admin.' }, 503),
    );

    expect(message).toMatch(/retrying will not help/i);
    expect(message).not.toMatch(/try again in a minute/i);
  });
});

describe('resolveOrganization', () => {
  it('uses the only organization without asking', () => {
    expect(resolveOrganization(userFixture())).toEqual({
      kind: 'single',
      id: 7,
      name: 'Hoosier OsteoTronix',
    });
  });

  it('offers a choice when there is more than one, defaulting to the primary', () => {
    const choice = resolveOrganization(
      userFixture([
        organizationFixture({ id: 4, name: 'Second Org', is_primary: false }),
        organizationFixture({ id: 7, name: 'Hoosier OsteoTronix', is_primary: true }),
      ]),
    );

    expect(choice).toMatchObject({ kind: 'choose', defaultId: 7 });
    expect(choice.kind === 'choose' && choice.options).toHaveLength(2);
  });

  it('falls back to the first organization when none is marked primary', () => {
    const choice = resolveOrganization(
      userFixture([
        organizationFixture({ id: 4, is_primary: false }),
        organizationFixture({ id: 7, is_primary: false }),
      ]),
    );

    expect(choice).toMatchObject({ kind: 'choose', defaultId: 4 });
  });

  it('reports no organization rather than guessing one', () => {
    expect(resolveOrganization(userFixture([]))).toEqual({ kind: 'none' });
    expect(resolveOrganization(null)).toEqual({ kind: 'none' });
  });

  it('survives a cached profile written before organizations existed', () => {
    // readCachedUser() JSON.parses whatever localStorage holds, so the field can
    // be missing at runtime however the type reads.
    const legacy = { ...userFixture(), organizations: undefined } as unknown as Parameters<
      typeof resolveOrganization
    >[0];

    expect(resolveOrganization(legacy)).toEqual({ kind: 'none' });
  });
});
