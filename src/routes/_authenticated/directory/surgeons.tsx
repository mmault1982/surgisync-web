import { createFileRoute, retainSearchParams, stripSearchParams } from '@tanstack/react-router';

import { SurgeonsScreen } from '@/features/directory/components/surgeons-screen';
import { surgeonListQuery } from '@/features/directory/surgeons.queries';
import { SURGEON_DEFAULTS, surgeonSearchSchema } from '@/features/directory/surgeons.search';

export const Route = createFileRoute('/_authenticated/directory/surgeons')({
  validateSearch: surgeonSearchSchema,
  search: {
    middlewares: [retainSearchParams(['page_size']), stripSearchParams(SURGEON_DEFAULTS)],
  },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(surgeonListQuery(deps)),
  component: SurgeonsPage,
});

function SurgeonsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <SurgeonsScreen
      search={search}
      onSearchChange={(patch) => {
        void navigate({ search: (prev) => ({ ...prev, ...patch, page: 1 }), replace: true });
      }}
      onPageChange={(page) => {
        void navigate({ search: (prev) => ({ ...prev, page }) });
      }}
    />
  );
}
