import { createFileRoute, retainSearchParams, stripSearchParams } from '@tanstack/react-router';

import { ProceduresScreen } from '@/features/directory/components/procedures-screen';
import { procedureListQuery } from '@/features/directory/procedures.queries';
import { PROCEDURE_DEFAULTS, procedureSearchSchema } from '@/features/directory/procedures.search';

export const Route = createFileRoute('/_authenticated/directory/procedures')({
  validateSearch: procedureSearchSchema,
  search: {
    middlewares: [retainSearchParams(['page_size']), stripSearchParams(PROCEDURE_DEFAULTS)],
  },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(procedureListQuery(deps)),
  component: ProceduresPage,
});

function ProceduresPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  // Navigation lives here so the screen stays presentational and testable
  // without a router — the same split every other screen makes.
  return (
    <ProceduresScreen
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
