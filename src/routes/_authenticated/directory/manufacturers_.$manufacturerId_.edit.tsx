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
import { ManufacturerFormScreen } from '@/features/directory/components/manufacturer-form-screen';
import { manufacturerDetailQuery } from '@/features/directory/manufacturers.queries';

/**
 * Edit Manufacturer.
 *
 * The second trailing `_`, on `$manufacturerId`, is what keeps this out of the
 * detail route — `manufacturers_.$manufacturerId.tsx` has no `<Outlet/>`
 * either, so without it this would nest and render nothing.
 */
export const Route = createFileRoute(
  '/_authenticated/directory/manufacturers_/$manufacturerId_/edit',
)({
  staticData: { breadcrumb: 'Edit Manufacturer' },
  beforeLoad: ({ context, params }) => {
    if (!canManageOrgRecords(context.user.role)) {
      // Back to the record rather than the list: a rep who followed a link here
      // can still read the manufacturer, and that is what they were after.
      throw redirect({
        to: '/directory/manufacturers/$manufacturerId',
        params: { manufacturerId: params.manufacturerId },
      });
    }
  },
  loader: async ({ context, params }) => {
    const id = Number(params.manufacturerId);
    if (!Number.isInteger(id) || id <= 0) throw notFound();

    let manufacturer;
    try {
      manufacturer = await context.queryClient.ensureQueryData(manufacturerDetailQuery(id));
    } catch (error) {
      if (isNotFound(error)) throw notFound();
      throw error;
    }

    // Reads span every organization the caller belongs to; writes are filed
    // under one of them. So a row can be perfectly readable here and 404 on
    // every write against it. This cannot go in `beforeLoad` — ownership is
    // not known until the record is loaded — and the record is the right place
    // to land, since reading it is still allowed.
    if (!manufacturer.is_owned) {
      throw redirect({
        to: '/directory/manufacturers/$manufacturerId',
        params: { manufacturerId: params.manufacturerId },
      });
    }
    return manufacturer;
  },
  errorComponent: ({ error }) => <EditManufacturerError message={errorMessage(error)} />,
  notFoundComponent: () => (
    <EditManufacturerError message="That manufacturer no longer exists, or you do not have access to it." />
  ),
  component: EditManufacturerPage,
});

function EditManufacturerPage() {
  const { manufacturerId } = Route.useParams();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();

  // The loader has already resolved this, so `data` is present on first paint.
  const manufacturer = useQuery(manufacturerDetailQuery(Number(manufacturerId))).data!;

  const toRecord = () => {
    void navigate({
      to: '/directory/manufacturers/$manufacturerId',
      params: { manufacturerId },
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
          // History first, so Cancel from a record arrived at through a
          // narrowed list returns to that list still narrowed.
          onClick={() => (canGoBack ? router.history.back() : toRecord())}
        >
          <ChevronLeftIcon />
        </Button>
        <h1 className="text-2xl font-semibold text-primary">Edit Manufacturer</h1>
      </div>
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        The name appears everywhere this manufacturer is listed. The contact details belong to the
        organization behind it, so any other role it plays shows the same ones.
      </p>

      <ManufacturerFormScreen manufacturer={manufacturer} onCancel={toRecord} onSaved={toRecord} />
    </div>
  );
}

function EditManufacturerError({ message }: { message: string }) {
  return (
    <div className="p-12 text-center">
      <p className="font-medium text-foreground">Could not open this manufacturer</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" className="mt-4" asChild>
        <Link to="/directory/manufacturers">Back to Manufacturers</Link>
      </Button>
    </div>
  );
}
