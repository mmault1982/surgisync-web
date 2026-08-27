import { describe, expect, it } from 'vitest';

import { canManageOrgRecords } from '../permissions';

describe('canManageOrgRecords', () => {
  it('accepts the two roles the backend accepts', () => {
    // Mirrors ADMIN_ROLES in users/permissions.py.
    expect(canManageOrgRecords('admin')).toBe(true);
    expect(canManageOrgRecords('entity_global_admin')).toBe(true);
  });

  it('refuses a rep, who would otherwise fill the form and be told 403', () => {
    expect(canManageOrgRecords('non_admin')).toBe(false);
  });

  it('refuses an absent role rather than assuming one', () => {
    expect(canManageOrgRecords(null)).toBe(false);
    expect(canManageOrgRecords(undefined)).toBe(false);
  });
});
