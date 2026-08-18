import { createFileRoute } from '@tanstack/react-router';

import { HanselPage } from '@/features/hansel/components/hansel-page';

/**
 * Configuration › Hansel.
 *
 * **No loader, deliberately.** Every endpoint behind this page 403s for a
 * signed-in user who is not an organization administrator, which is an ordinary
 * state rather than a failure — and a loader would turn it into
 * `errorComponent`, replacing the whole page with an error for a page that is
 * working exactly as designed. Each section owns its own query and its own
 * states instead, which is also what lets a second section fail without taking
 * the first one down.
 *
 * `user` comes from `_authenticated`'s `beforeLoad`, which has already
 * redirected anyone without a session — so it is non-null here, and the page
 * takes it as a prop rather than calling `useAuth()`. That keeps the component
 * renderable in a test with no `AuthProvider`, which would otherwise fire a
 * boot refresh that MSW's `onUnhandledRequest: 'error'` fails the test over.
 */
export const Route = createFileRoute('/_authenticated/configuration/hansel')({
  component: HanselRoute,
});

function HanselRoute() {
  const { user } = Route.useRouteContext();
  return <HanselPage user={user} />;
}
