import { createFileRoute, retainSearchParams, stripSearchParams } from '@tanstack/react-router';

import { FacilitiesScreen } from '@/features/directory/components/facilities-screen';
import { facilityListQuery } from '@/features/directory/facilities.queries';
import { FACILITY_DEFAULTS, facilitySearchSchema } from '@/features/directory/facilities.search';

export const Route = createFileRoute('/_authenticated/directory/facilities')({
  validateSearch: facilitySearchSchema,
  search: {
    middlewares: [
      // Page size follows you across navigations; the filters do not.
      retainSearchParams(['page_size']),
      // Keep a shared URL to what actually differs from the default.
      stripSearchParams(FACILITY_DEFAULTS),
    ],
  },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(facilityListQuery(deps)),
  component: FacilitiesPage,
});

function FacilitiesPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  // Navigation lives here rather than in the screen, the same split Manage
  // On-Hand and Manufacturers make: the feature components stay presentational
  // and testable without a router.
  return (
    <FacilitiesScreen
      search={search}
      onSearchChange={(patch) => {
        // Any narrowing resets to page 1 — page 3 of a new result set is
        // usually empty, which reads as "the filter found nothing".
        void navigate({ search: (prev) => ({ ...prev, ...patch, page: 1 }), replace: true });
      }}
      onPageChange={(page) => {
        void navigate({ search: (prev) => ({ ...prev, page }) });
      }}
      // Add and Edit are pages rather than a dialog on this screen — a
      // facility carries twenty-five writable fields across two resources.
      onAdd={() => {
        void navigate({ to: '/directory/facilities/new' });
      }}
      onOpen={(id) => {
        void navigate({
          to: '/directory/facilities/$facilityId',
          params: { facilityId: String(id) },
        });
      }}
      onEdit={(id) => {
        void navigate({
          to: '/directory/facilities/$facilityId/edit',
          params: { facilityId: String(id) },
        });
      }}
    />
  );
}
