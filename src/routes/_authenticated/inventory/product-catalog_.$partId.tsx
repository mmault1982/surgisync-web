import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound, useCanGoBack, useRouter } from '@tanstack/react-router';
import { ChevronLeftIcon } from 'lucide-react';

import { errorMessage, isNotFound } from '@/api/errors';
import { useAuth } from '@/auth/auth-context';
import { canManageOrgRecords } from '@/auth/permissions';
import { Button } from '@/components/ui/button';
import { productDetailQuery } from '@/features/catalog/catalog.queries';
import { ProductDetailScreen } from '@/features/catalog/components/product-detail-screen';

/**
 * Product Detail.
 *
 * A sibling of the catalog list rather than a child of it: `product-catalog.tsx`
 * has no `<Outlet/>`, and the trailing `_` in this filename is what opts the
 * route out of nesting under it while still resolving to
 * `/inventory/product-catalog/{id}`. It stays inside `_authenticated/`, so the
 * guard and `AppShell` still apply. The same shape as Kit Detail.
 */
export const Route = createFileRoute('/_authenticated/inventory/product-catalog_/$partId')({
  // The crumb the nav tree cannot supply — this screen is not a nav target.
  // See `findNavSubtree` in nav-config.ts for the other half.
  staticData: { breadcrumb: 'Product Detail' },
  loader: async ({ context, params }) => {
    const id = Number(params.partId);
    // A junk id is a 404, not a request. Guarding here rather than in a `parse`
    // keeps `Route.useParams()` a plain string and the link call sites simple.
    if (!Number.isInteger(id) || id <= 0) throw notFound();

    try {
      return await context.queryClient.ensureQueryData(productDetailQuery(id));
    } catch (error) {
      // A part that does not exist and a part belonging to another
      // organization are deliberately indistinguishable. Both want the
      // not-found screen.
      if (isNotFound(error)) throw notFound();
      throw error;
    }
  },
  errorComponent: ({ error }) => <ProductDetailError message={errorMessage(error)} />,
  notFoundComponent: () => (
    <ProductDetailError message="That product no longer exists, or you do not have access to it." />
  ),
  component: ProductDetailPage,
});

function ProductDetailPage() {
  const { partId } = Route.useParams();
  const navigate = Route.useNavigate();
  const id = Number(partId);

  // The loader has already resolved this, so `data` is present on first paint.
  const part = useQuery(productDetailQuery(id)).data!;
  const canManage = canManageOrgRecords(useAuth().user?.role);

  return (
    <div className="p-6">
      <PageTitle />
      <ProductDetailScreen
        part={part}
        canManage={canManage}
        onEdit={() => {
          void navigate({
            to: '/inventory/product-catalog/$partId/edit',
            params: { partId },
          });
        }}
      />
    </div>
  );
}

/**
 * `‹ Product Detail`.
 *
 * History rather than a link when there is history to go back to: the list
 * holds two filters plus search, sort and page in its URL, and
 * `retainSearchParams` keeps only two of them across a navigation. A plain
 * `<Link>` back would silently discard the filters of anyone who had narrowed
 * the table — which is exactly the person who came here from it.
 */
function PageTitle() {
  const router = useRouter();
  const canGoBack = useCanGoBack();

  return (
    <div className="mb-4 flex items-center gap-1">
      {canGoBack ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Back"
          onClick={() => router.history.back()}
        >
          <ChevronLeftIcon />
        </Button>
      ) : (
        <Button variant="ghost" size="icon-sm" aria-label="Back" asChild>
          <Link to="/inventory/product-catalog">
            <ChevronLeftIcon />
          </Link>
        </Button>
      )}
      <h1 className="text-2xl font-semibold text-primary">Product Detail</h1>
    </div>
  );
}

function ProductDetailError({ message }: { message: string }) {
  return (
    <div className="p-12 text-center">
      <p className="font-medium text-foreground">Could not open this product</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" className="mt-4" asChild>
        <Link to="/inventory/product-catalog">Back to Product Catalog</Link>
      </Button>
    </div>
  );
}
