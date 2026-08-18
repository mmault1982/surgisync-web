import { createFileRoute, retainSearchParams, stripSearchParams } from '@tanstack/react-router';

import { ManufacturersScreen } from '@/features/directory/components/manufacturers-screen';
import { manufacturerListQuery } from '@/features/directory/manufacturers.queries';
import {
  MANUFACTURER_DEFAULTS,
  manufacturerSearchSchema,
} from '@/features/directory/manufacturers.search';

export const Route = createFileRoute('/_authenticated/directory/manufacturers')({
  validateSearch: manufacturerSearchSchema,
  search: {
    middlewares: [
      // Page size follows you across navigations; the search term does not.
      retainSearchParams(['page_size']),
      // Keep a shared URL to what actually differs from the default.
      stripSearchParams(MANUFACTURER_DEFAULTS),
    ],
  },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(manufacturerListQuery(deps)),
  component: ManufacturersPage,
});

function ManufacturersPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  // Navigation lives here rather than in the screen, the same split Manage
  // On-Hand makes: the feature components stay presentational and testable
  // without a router.
  return (
    <ManufacturersScreen
      search={search}
      onSearchChange={(patch) => {
        // Any narrowing resets to page 1 — page 3 of a new result set is
        // usually empty, which reads as "the search found nothing".
        void navigate({ search: (prev) => ({ ...prev, ...patch, page: 1 }), replace: true });
      }}
      onPageChange={(page) => {
        void navigate({ search: (prev) => ({ ...prev, page }) });
      }}
    />
  );
}
