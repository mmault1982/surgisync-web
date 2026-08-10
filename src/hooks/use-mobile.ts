import { useSyncExternalStore } from 'react';

const MOBILE_BREAKPOINT = 768;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

/**
 * Which layout the sidebar should use: the docked panel, or the mobile `Sheet`.
 *
 * Rewritten from shadcn's `useState` + `useEffect` original, which failed
 * `react-hooks/set-state-in-effect` (`pnpm lint` runs `--max-warnings 0`). The
 * rule has a point: that version renders desktop first and corrects itself
 * after mount, so a phone gets one frame of the wrong layout. Reading the media
 * query as an external store — the same shape `auth-context.tsx` uses — is both
 * correct on the first paint and lint-clean.
 */
function subscribe(onStoreChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onStoreChange);
  return () => mql.removeEventListener('change', onStoreChange);
}

// A boolean, so React's snapshot identity check is a value comparison.
function getSnapshot() {
  return window.matchMedia(QUERY).matches;
}

export function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot);
}
