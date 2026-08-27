import { createFileRoute, redirect, useCanGoBack, useRouter } from '@tanstack/react-router';
import { ChevronLeftIcon } from 'lucide-react';

import { canManageOrgRecords } from '@/auth/permissions';
import { Button } from '@/components/ui/button';
import { ProductFormScreen } from '@/features/catalog/components/product-form-screen';

/**
 * Add Product.
 *
 * A sibling of the catalog list, like Product Detail — the trailing `_` opts
 * out of nesting under a route with no `<Outlet/>`. Static `new` beats the
 * dynamic `$partId` in route matching, so the two cannot collide.
 */
export const Route = createFileRoute('/_authenticated/inventory/product-catalog_/new')({
  staticData: { breadcrumb: 'Add Product' },
  // The server refuses the write anyway; this is what keeps a rep from filling
  // in seven fields to be told 403 on submit. Deep links and the back button
  // both come through here, which the hidden button on the list cannot cover.
  beforeLoad: ({ context }) => {
    if (!canManageOrgRecords(context.user.role)) {
      throw redirect({ to: '/inventory/product-catalog' });
    }
  },
  component: AddProductPage,
});

function AddProductPage() {
  const navigate = Route.useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();

  // History where there is any, so the list's filters survive — the same
  // reasoning as Product Detail's back control.
  const back = () => {
    if (canGoBack) router.history.back();
    else void navigate({ to: '/inventory/product-catalog' });
  };

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" aria-label="Back" onClick={back}>
          <ChevronLeftIcon />
        </Button>
        <h1 className="text-2xl font-semibold text-primary">Add Product</h1>
      </div>
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        A part your organization can receive stock against. It appears in the catalog and in the
        Receive form’s pickers as soon as it is saved.
      </p>

      <ProductFormScreen
        part={null}
        onCancel={back}
        // Straight to the new part rather than back to the list: the user has
        // just described a record and the detail page is the confirmation that
        // it is what they meant. `replace`, so Back skips the emptied form.
        onSaved={(saved) => {
          void navigate({
            to: '/inventory/product-catalog/$partId',
            params: { partId: String(saved.id) },
            replace: true,
          });
        }}
      />
    </div>
  );
}
