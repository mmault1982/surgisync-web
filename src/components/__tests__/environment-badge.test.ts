import { describe, expect, it } from 'vitest';

import { environmentFor } from '@/lib/environment';

describe('environment detection', () => {
  it('derives the environment from the hostname, not from the build', () => {
    expect(environmentFor('localhost')?.label).toBe('LOCAL');
    expect(environmentFor('127.0.0.1')?.label).toBe('LOCAL');
    expect(environmentFor('app-staging.surgisoftsolutions.com')?.label).toBe('STAGING');
  });

  it('shows nothing in production', () => {
    // A badge that is always on stops being read.
    expect(environmentFor('app.surgisoftsolutions.com')).toBeNull();
  });
});
