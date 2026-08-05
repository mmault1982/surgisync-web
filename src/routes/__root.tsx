import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';

import type { AuthApi } from '@/auth/auth-context';

export interface RouterContext {
  queryClient: QueryClient;
  auth: AuthApi;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: () => (
    <div className="flex min-h-dvh items-center justify-center bg-surface p-6 text-center">
      <div>
        <p className="text-lg font-semibold text-gray-900">Page not found</p>
        <p className="mt-1 text-sm text-gray-600">The page you were looking for does not exist.</p>
      </div>
    </div>
  ),
});
