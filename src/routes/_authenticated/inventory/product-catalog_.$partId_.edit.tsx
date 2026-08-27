import { useQuery } from '@tanstack/react-query';
import {
  createFileRoute,
  Link,
  notFound,
  redirect,
  useCanGoBack,
  useRouter,
} from '@tanstack/react-router';
import { ChevronLeftIcon } from 'lucide-react';

import { errorMessage, isNotFound } from '@/api/errors';
import { canManageOrgRecords } from '@/auth/permissions';
import { Button } from '@/components/ui/button';
import { productDetailQuery } from '@/features/catalog/catalog.queries';
import { ProductFormScreen } from '@/features/catalog/components/product-form-screen';

/**
 * Edit Product.
 *
 * The second trailing `_`, on `$partId`, is what keeps this out of the detail
 * route — `product-catalog_.$partId.tsx` has no `<Outlet/>` either, so without
 * it this would nest and render nothing.
 */
export const Route = createFileRoute('/_authenticated/inventory/product-catalog_/$partId_/edit')({
  staticData: { breadcrumb: 'Edit Product' },
  beforeLoad: ({ context, params }) => {
    if (!canManageOrgRecords(context.user.role)) {
      // Back to the record rather than the list: a rep who followed a link
      // here can still read the part, and that is what they were after.
      throw redirect({
        to: '/inventory/product-catalog/$partId',
        params: { partId: params.partId },
      });
    }
  },
  loader: async ({ context, params }) => {
    const id = Number(params.partId);
    if (!Number.isInteger(id) || id <= 0) throw notFound();

    try {
      return await context.queryClient.ensureQueryData(productDetailQuery(id));
    } catch (error) {
      if (isNotFound(error)) throw notFound();
      throw error;
    }
  },
  errorComponent: ({ error }) => <EditProductError message={errorMessage(error)} />,
  notFoundComponent: () => (
    <EditProductError message="That product no longer exists, or you do not have access to it." />
  ),
  component: EditProductPage,
});

function EditProductPage() {
  const { partId } = Route.useParams();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();

  // The loader has already resolved this, so `data` is present on first paint.
  const part = useQuery(productDetailQuery(Number(partId))).data!;

  const toDetail = () => {
    void navigate({
      to: '/inventory/product-catalog/$partId',
      params: { partId },
      replace: true,
    });
  };

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Back"
          // History first, so Cancel from a detail page arrived at through a
          // filtered list returns to that list still filtered.
          onClick={() => (canGoBack ? router.history.back() : toDetail())}
        >
          <ChevronLeftIcon />
        </Button>
        <h1 className="text-2xl font-semibold text-primary">Edit Product</h1>
      </div>
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        Changes apply everywhere this part is listed. Stock already received against it keeps
        pointing at the same record.
      </p>

      <ProductFormScreen part={part} onCancel={toDetail} onSaved={toDetail} />
    </div>
  );
}

function EditProductError({ message }: { message: string }) {
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
