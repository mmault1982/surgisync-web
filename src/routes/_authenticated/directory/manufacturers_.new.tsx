import { createFileRoute, redirect, useCanGoBack, useRouter } from '@tanstack/react-router';
import { ChevronLeftIcon } from 'lucide-react';

import { canManageOrgRecords } from '@/auth/permissions';
import { Button } from '@/components/ui/button';
import { ManufacturerFormScreen } from '@/features/directory/components/manufacturer-form-screen';

/**
 * Add Manufacturer.
 *
 * A sibling of the list, like Manufacturer Detail — the trailing `_` opts out
 * of nesting under a route with no `<Outlet/>`. Static `new` beats the dynamic
 * `$manufacturerId` in route matching, so the two cannot collide.
 */
export const Route = createFileRoute('/_authenticated/directory/manufacturers_/new')({
  staticData: { breadcrumb: 'Add Manufacturer' },
  // The server refuses the write anyway; this is what keeps a rep from filling
  // in eleven fields to be told 403 on submit. Deep links and the back button
  // both come through here, which the hidden button on the list cannot cover.
  beforeLoad: ({ context }) => {
    if (!canManageOrgRecords(context.user.role)) {
      throw redirect({ to: '/directory/manufacturers' });
    }
  },
  component: AddManufacturerPage,
});

function AddManufacturerPage() {
  const navigate = Route.useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();

  const toList = () => {
    // History where there is any, so the list's search term survives — the
    // same reasoning as Manufacturer Detail's back control.
    if (canGoBack) router.history.back();
    else void navigate({ to: '/directory/manufacturers' });
  };

  const toRecord = (id: number) => {
    void navigate({
      to: '/directory/manufacturers/$manufacturerId',
      params: { manufacturerId: String(id) },
      replace: true,
    });
  };

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" aria-label="Back" onClick={toList}>
          <ChevronLeftIcon />
        </Button>
        <h1 className="text-2xl font-semibold text-primary">Add Manufacturer</h1>
      </div>
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        Visible to your organization only. A name already in your lists counts as a duplicate.
        Receiving stock against a manufacturer also needs its catalog of parts, which is loaded
        separately.
      </p>

      <ManufacturerFormScreen
        manufacturer={null}
        // Handed whatever row exists. A save is two requests and the second can
        // fail on its own, so there may be a manufacturer to go back to that
        // did not exist when this form opened — sending the user to the list
        // then would look as though nothing had been created.
        onCancel={(record) => (record ? toRecord(record.id) : toList())}
        // Straight to the new record rather than back to the list: the user has
        // just described one and the detail page is the confirmation that it is
        // what they meant. `replace`, so Back skips the emptied form.
        onSaved={(saved) => toRecord(saved.id)}
      />
    </div>
  );
}
