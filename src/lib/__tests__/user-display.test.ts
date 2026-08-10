import { describe, expect, it } from 'vitest';

import type { WebUser } from '@/api/generated/model';

import { displayName, initials } from '../user-display';

function user(overrides: Partial<WebUser>): WebUser {
  return {
    id: 1,
    email: 'ada@example.com',
    name: 'Ada Lovelace',
    role: null,
    organization_name: null,
    organizations: [],
    ...overrides,
  };
}

describe('displayName', () => {
  it('prefers the name', () => {
    expect(displayName(user({}))).toBe('Ada Lovelace');
  });

  it('falls back to the email when the backend sends a blank name', () => {
    // UserProfile.name is not required, so '' is a real value, not a bug.
    expect(displayName(user({ name: '' }))).toBe('ada@example.com');
    expect(displayName(user({ name: '   ' }))).toBe('ada@example.com');
  });

  it('renders something for a null user', () => {
    // Not hypothetical: the profile is a localStorage cache and /refresh/
    // returns tokens only, so a restored session can be authenticated with no
    // user object at all.
    expect(displayName(null)).toBe('Signed in');
  });
});

describe('initials', () => {
  it('takes the first and last word, not the first two', () => {
    expect(initials(user({ name: 'Mary Jane Watson' }))).toBe('MW');
  });

  it('takes two letters from a single name', () => {
    expect(initials(user({ name: 'Ada' }))).toBe('AD');
  });

  it('falls back to the email initial', () => {
    expect(initials(user({ name: '', email: 'ada@example.com' }))).toBe('A');
  });

  it('never returns an empty string', () => {
    // An empty AvatarFallback collapses to a blank circle.
    expect(initials(null)).toBe('?');
    expect(initials(user({ name: '', email: '' }))).toBe('?');
  });
});
