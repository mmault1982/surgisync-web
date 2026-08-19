import { describe, expect, it } from 'vitest';

import { canManageDirectory } from '../permissions';

describe('canManageDirectory', () => {
  it('accepts the two roles the backend accepts', () => {
    // Mirrors ADMIN_ROLES in users/permissions.py.
    expect(canManageDirectory('admin')).toBe(true);
    expect(canManageDirectory('entity_global_admin')).toBe(true);
  });

  it('refuses a rep, who would otherwise fill the form and be told 403', () => {
    expect(canManageDirectory('non_admin')).toBe(false);
  });

  it('refuses an absent role rather than assuming one', () => {
    expect(canManageDirectory(null)).toBe(false);
    expect(canManageDirectory(undefined)).toBe(false);
  });
});
