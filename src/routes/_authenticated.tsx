import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { AppShell } from '@/components/app-shell';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context, location }) => {
    // ensureRestored() is memoised in the auth store: on a hard load this is
    // the one boot refresh, and on every later navigation it is an
    // already-resolved promise. It cannot race the provider's effect because
    // both await the same promise object.
    const user = await context.auth.ensureRestored();
    if (!user) {
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }
    return { user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
