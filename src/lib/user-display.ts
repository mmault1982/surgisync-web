import type { WebUser } from '@/api/generated/model';

/**
 * How to render a signed-in user when the profile is unreliable.
 *
 * `user` can be null while the session is perfectly healthy: the profile is a
 * localStorage cache written at login, and `/api/v1/web/refresh/` returns
 * tokens only. Clear site data, restore from the cookie, and you are logged in
 * with nothing to show. `name` can also be an empty string — it comes straight
 * from the backend's UserProfile.
 *
 * So every accessor here falls all the way through to something renderable
 * rather than letting the sidebar footer collapse or print "undefined".
 */

const UNKNOWN_NAME = 'Signed in';
const UNKNOWN_INITIAL = '?';

/** Best available label: real name, else the email, else a neutral placeholder. */
export function displayName(user: WebUser | null): string {
  return user?.name?.trim() || user?.email?.trim() || UNKNOWN_NAME;
}

/**
 * One or two letters for the avatar fallback. There is no avatar URL in the
 * contract, so this is the only thing the `<Avatar>` ever shows.
 */
export function initials(user: WebUser | null): string {
  const words = user?.name?.trim().split(/\s+/).filter(Boolean) ?? [];

  if (words.length >= 2) {
    // First and last, not first two: "Mary Jane Watson" reads as MW.
    return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
  }
  if (words.length === 1) {
    return words[0]!.slice(0, 2).toUpperCase();
  }

  const email = user?.email?.trim();
  return email ? email[0]!.toUpperCase() : UNKNOWN_INITIAL;
}
