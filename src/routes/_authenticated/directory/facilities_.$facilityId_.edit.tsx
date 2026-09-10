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
import { FacilityFormScreen } from '@/features/directory/components/facility-form-screen';
import { facilityDetailQuery } from '@/features/directory/facilities.queries';

/**
 * Edit Facility.
 *
 * The second trailing `_`, on `$facilityId`, is what keeps this out of the
 * detail route — `facilities_.$facilityId.tsx` has no `<Outlet/>` either, so
 * without it this would nest and render nothing.
 */
export const Route = createFileRoute('/_authenticated/directory/facilities_/$facilityId_/edit')({
  staticData: { breadcrumb: 'Edit Facility' },
  beforeLoad: ({ context, params }) => {
    if (!canManageOrgRecords(context.user.role)) {
      // Back to the record rather than the list: a rep who followed a link here
      // can still read the facility, and that is what they were after.
      throw redirect({
        to: '/directory/facilities/$facilityId',
        params: { facilityId: params.facilityId },
      });
    }
  },
  loader: async ({ context, params }) => {
    const id = Number(params.facilityId);
    if (!Number.isInteger(id) || id <= 0) throw notFound();

    let facility;
    try {
      facility = await context.queryClient.ensureQueryData(facilityDetailQuery(id));
    } catch (error) {
      if (isNotFound(error)) throw notFound();
      throw error;
    }

    // Reads span every organization the caller belongs to; writes are filed
    // under one of them. So a row can be perfectly readable here and 404 on
    // every write against it. This cannot go in `beforeLoad` — ownership is
    // not known until the record is loaded — and the record is the right place
    // to land, since reading it is still allowed.
    if (!facility.is_owned) {
      throw redirect({
        to: '/directory/facilities/$facilityId',
        params: { facilityId: params.facilityId },
      });
    }

    // Deliberately **no** `is_active` guard. A deactivated facility must stay
    // editable — correcting a licence number on a row that is currently stood
    // down is an ordinary thing to want, and the backend's detail queryset
    // carries no active filter for exactly this reason.
    return facility;
  },
  errorComponent: ({ error }) => <EditFacilityError message={errorMessage(error)} />,
  notFoundComponent: () => (
    <EditFacilityError message="That facility no longer exists, or you do not have access to it." />
  ),
  component: EditFacilityPage,
});

function EditFacilityPage() {
  const { facilityId } = Route.useParams();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();

  // The loader has already resolved this, so `data` is present on first paint.
  const facility = useQuery(facilityDetailQuery(Number(facilityId))).data!;

  const toRecord = () => {
    void navigate({
      to: '/directory/facilities/$facilityId',
      params: { facilityId },
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
        <h1 className="text-2xl font-semibold text-primary">Edit Facility</h1>
      </div>
      <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
        The name appears everywhere this facility is listed. It belongs to the organization behind
        it, so if that organization is also one of your manufacturers, renaming here renames it
        there too — the contact details are shared for the same reason.
      </p>

      <FacilityFormScreen facility={facility} onCancel={toRecord} onSaved={toRecord} />
    </div>
  );
}

function EditFacilityError({ message }: { message: string }) {
  return (
    <div className="p-12 text-center">
      <p className="font-medium text-foreground">Could not open this facility</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" className="mt-4" asChild>
        <Link to="/directory/facilities">Back to Facilities</Link>
      </Button>
    </div>
  );
}
