/**
 * Which backend this page is talking to, derived from the hostname.
 *
 * Not a build-time constant: the bundle is environment-agnostic because the API
 * is always at a relative `/api/v1/`. The spike's `export const currentEnv =
 * environments.local` had to be edited and committed to switch environment,
 * which is exactly the failure this avoids.
 */
export interface EnvironmentBadgeInfo {
  label: string;
  classes: string;
}

export function environmentFor(hostname: string): EnvironmentBadgeInfo | null {
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return { label: 'LOCAL', classes: 'bg-gray-100 text-gray-700 ring-gray-300' };
  }
  if (hostname.includes('staging')) {
    return { label: 'STAGING', classes: 'bg-amber-100 text-amber-800 ring-amber-300' };
  }
  // Production shows nothing — a badge that is always present stops being read.
  return null;
}
