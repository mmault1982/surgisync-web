import type { HanselCredential, WebOrganization, WebUser } from '@/api/generated/model';

/** A configured, verified, healthy credential. Override one field per test. */
export function credentialFixture(overrides: Partial<HanselCredential> = {}): HanselCredential {
  return {
    id: 1,
    parent_company: 7,
    parent_company_name: 'Hoosier OsteoTronix',
    client_id: 'hansel-client-abc',
    workspace_id: '3f1c9e2a-5b6d-4f7a-8c9d-0e1f2a3b4c5d',
    client_secret_set: true,
    client_secret_last4: '9f2c',
    secret_readable: true,
    is_active: true,
    last_verified_at: '2026-08-17T14:05:00Z',
    last_verification_error: '',
    created_at: '2026-08-01T09:00:00Z',
    updated_at: '2026-08-17T14:05:00Z',
    ...overrides,
  };
}

export function organizationFixture(overrides: Partial<WebOrganization> = {}): WebOrganization {
  return {
    id: 7,
    name: 'Hoosier OsteoTronix',
    type: 'distributor',
    role: 'admin',
    is_primary: true,
    ...overrides,
  };
}

export function userFixture(organizations: WebOrganization[] = [organizationFixture()]): WebUser {
  return {
    id: 3,
    email: 'admin@surgisync.test',
    name: 'Dana Reid',
    role: 'admin',
    organization_name: organizations[0]?.name ?? null,
    organizations,
  };
}

/** The house paginated envelope, which the list endpoint returns. */
export function credentialPage(results: HanselCredential[]) {
  return {
    total_data: results.length,
    next: null,
    previous: null,
    current_page: 1,
    total_pages: 1,
    results,
  };
}
