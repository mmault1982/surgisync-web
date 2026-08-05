import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';

import { LoginForm } from '@/features/auth/login-form';

const DEFAULT_REDIRECT = '/inventory/on-hand';

export const Route = createFileRoute('/login')({
  validateSearch: z.object({
    // .catch so a hand-edited or stale URL degrades to the default rather than
    // throwing a route error at someone who is only trying to sign in.
    redirect: z.string().optional().catch(undefined),
  }),
  beforeLoad: async ({ context, search }) => {
    // The mirror of the _authenticated guard: a hard load of /login while a
    // live cookie exists must not show a sign-in form to someone already
    // signed in. Shares the same memoised restore, so it costs nothing.
    if (await context.auth.ensureRestored()) {
      throw redirect({ to: search.redirect ?? DEFAULT_REDIRECT });
    }
  },
  component: LoginRoute,
});

function LoginRoute() {
  const { redirect: redirectTo } = Route.useSearch();
  return <LoginForm redirectTo={redirectTo ?? DEFAULT_REDIRECT} />;
}
