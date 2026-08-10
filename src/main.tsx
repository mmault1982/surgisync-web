import { QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { createQueryClient } from '@/api/query-client';
import { AuthProvider, useAuth } from '@/auth/auth-context';

import './index.css';
import { routeTree } from './routeTree.gen';

const queryClient = createQueryClient();

const router = createRouter({
  routeTree,
  // Filled in by InnerApp — `auth` is not available until inside the provider.
  context: { queryClient, auth: undefined! },
  defaultPreload: 'intent',
  defaultPendingComponent: () => (
    <div className="flex min-h-dvh items-center justify-center bg-surface">
      <span
        className="size-6 animate-spin rounded-full border-2 border-brand/30 border-t-brand"
        role="status"
        aria-label="Loading"
      />
    </div>
  ),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }

  interface StaticDataRouteOption {
    /**
     * The trailing breadcrumb for a screen that is not itself a nav target, so
     * `AppBreadcrumb` can say `Inventory › Manage On-Hand › Kit Detail`.
     *
     * Optional, and it has to stay that way: TanStack resolves `staticData` to
     * `RequiredStaticDataRouteOption` the moment this interface has one
     * required key, which would make `staticData` mandatory on every route in
     * the app and fail `tsc` in all of them at once.
     */
    breadcrumb?: string;
  }
}

function InnerApp() {
  const auth = useAuth();
  return <RouterProvider router={router} context={{ queryClient, auth }} />;
}

createRoot(document.getElementById('root')!).render(
  // StrictMode is back on. It was removed in the spike because its double
  // effects fired two concurrent refreshes and the backend blacklisted the
  // rotated token; single-flight refresh in auth-store.ts collapses them into
  // one request, so the hazard is gone.
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <InnerApp />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
