import { createFileRoute, retainSearchParams, stripSearchParams } from '@tanstack/react-router';

import { catalogListQuery } from '@/features/catalog/catalog.queries';
import {
  CATALOG_DEFAULTS,
  catalogSearchSchema,
  type CatalogSearch,
} from '@/features/catalog/catalog.search';
import { ProductCatalogScreen } from '@/features/catalog/components/product-catalog-screen';

export const Route = createFileRoute('/_authenticated/inventory/product-catalog')({
  validateSearch: catalogSearchSchema,
  search: {
    middlewares: [
      // Page size and sort follow you across navigations; the filters do not.
      retainSearchParams(['page_size', 'ordering']),
      // Keep shared URLs to what actually differs from the default.
      stripSearchParams(CATALOG_DEFAULTS),
    ],
  },
  // Re-runs the loader whenever any filter changes, so a deep link renders the
  // right rows on first paint rather than after a flash of the unfiltered set.
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(catalogListQuery(deps)),
  component: ProductCatalogPage,
});

function ProductCatalogPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  // Navigation lives here rather than in the screen, the same split Manage
  // On-Hand and the Manufacturers directory make: the feature components stay
  // presentational and testable without a router.
  return (
    <ProductCatalogScreen
      search={search}
      onSearchChange={(patch: Partial<CatalogSearch>) => {
        // Any narrowing resets to page 1 — page 4 of the old filter set is not
        // page 4 of the new one, and the paginator 404s past the last page.
        // `replace` keeps Back meaning "the previous screen" rather than "the
        // previous checkbox".
        void navigate({ search: (prev) => ({ ...prev, ...patch, page: 1 }), replace: true });
      }}
      onClearAll={() => {
        void navigate({ search: () => ({ ...CATALOG_DEFAULTS }), replace: true });
      }}
      onPageChange={(page) => {
        void navigate({ search: (prev) => ({ ...prev, page }) });
      }}
      onAdd={() => {
        void navigate({ to: '/inventory/product-catalog/new' });
      }}
      onOpenRow={(id) => {
        void navigate({
          to: '/inventory/product-catalog/$partId',
          params: { partId: String(id) },
        });
      }}
      onEdit={(id) => {
        void navigate({
          to: '/inventory/product-catalog/$partId/edit',
          params: { partId: String(id) },
        });
      }}
    />
  );
}
