import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound, useCanGoBack, useRouter } from '@tanstack/react-router';
import { ChevronLeftIcon } from 'lucide-react';

import { errorMessage, isNotFound } from '@/api/errors';
import { useAuth } from '@/auth/auth-context';
import { canManageOrgRecords } from '@/auth/permissions';
import { Button } from '@/components/ui/button';
import { CompanyAddressesCard } from '@/features/directory/components/company-addresses-card';
import { FacilityDetailScreen } from '@/features/directory/components/facility-detail-screen';
import { facilityKeys } from '@/features/directory/directory.keys';
import { facilityDetailQuery } from '@/features/directory/facilities.queries';

/**
 * Facility Detail.
 *
 * A sibling of the list rather than a child of it: `facilities.tsx` has no
 * `<Outlet/>`, and the trailing `_` in this filename is what opts the route out
 * of nesting under it while still resolving to `/directory/facilities/{id}`.
 * It stays inside `_authenticated/`, so the guard and `AppShell` still apply.
 * The same shape as Manufacturer Detail.
 */
export const Route = createFileRoute('/_authenticated/directory/facilities_/$facilityId')({
  // The crumb the nav tree cannot supply — this screen is not a nav target.
  // See `findNavSubtree` in nav-config.ts for the other half.
  staticData: { breadcrumb: 'Facility Detail' },
  loader: async ({ context, params }) => {
    const id = Number(params.facilityId);
    // A junk id is a 404, not a request. Guarding here rather than in a `parse`
    // keeps `Route.useParams()` a plain string and the link call sites simple.
    if (!Number.isInteger(id) || id <= 0) throw notFound();

    try {
      // One request answers the record, the `Company` identity behind it and
      // that company's address book.
      return await context.queryClient.ensureQueryData(facilityDetailQuery(id));
    } catch (error) {
      // A facility that does not exist and one belonging to another
      // organization are deliberately indistinguishable. Both want the
      // not-found screen.
      //
      // A *deactivated* facility is neither: the backend's detail queryset
      // carries no `is_active` filter, precisely so a stood-down row stays
      // reachable and can be brought back. So this never fires for one.
      if (isNotFound(error)) throw notFound();
      throw error;
    }
  },
  errorComponent: ({ error }) => <FacilityDetailError message={errorMessage(error)} />,
  notFoundComponent: () => (
    <FacilityDetailError message="That facility no longer exists, or you do not have access to it." />
  ),
  component: FacilityDetailPage,
});

function FacilityDetailPage() {
  const { facilityId } = Route.useParams();
  const navigate = Route.useNavigate();
  const id = Number(facilityId);

  // The loader has already resolved this, so `data` is present on first paint.
  const facility = useQuery(facilityDetailQuery(id)).data!;

  // One derived boolean, computed once and threaded down. Two props is how the
  // record card and the address book end up disagreeing about who may write.
  // Writes against a row this organization does not own are 404s, so offering
  // the controls would only teach that on submit.
  const canWrite = canManageOrgRecords(useAuth().user?.role) && facility.is_owned;

  return (
    <div className="p-6">
      <PageTitle />
      <FacilityDetailScreen
        facility={facility}
        canManage={canWrite}
        onEdit={() => {
          void navigate({
            to: '/directory/facilities/$facilityId/edit',
            params: { facilityId },
          });
        }}
      />

      {/*
        The company's id, not the facility's. They are unrelated integers, and
        the address endpoints put the owning organization in the URL on purpose
        — that identity may be shared with this organization's manufacturer and
        tenant rows.
      */}
      <CompanyAddressesCard
        companyId={facility.company.id}
        addresses={facility.company.addresses}
        canManage={canWrite}
        roleNoun="facility"
        // The detail documents, not the listing: an address cannot change a
        // table showing a name, a type and a status.
        invalidates={[facilityKeys.details()]}
      />
    </div>
  );
}

/**
 * `‹ Facility Detail`.
 *
 * History rather than a link when there is history to go back to: the list
 * holds a search term, three filters and a page in its URL, and
 * `retainSearchParams` keeps only `page_size` across a navigation. A plain
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
          <Link to="/directory/facilities">
            <ChevronLeftIcon />
          </Link>
        </Button>
      )}
      <h1 className="text-2xl font-semibold text-primary">Facility Detail</h1>
    </div>
  );
}

function FacilityDetailError({ message }: { message: string }) {
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
