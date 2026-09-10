import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound, useCanGoBack, useRouter } from '@tanstack/react-router';
import { ChevronLeftIcon } from 'lucide-react';

import { errorMessage, isNotFound } from '@/api/errors';
import { useAuth } from '@/auth/auth-context';
import { canManageOrgRecords } from '@/auth/permissions';
import { Button } from '@/components/ui/button';
import { CompanyAddressesCard } from '@/features/directory/components/company-addresses-card';
import { ManufacturerDetailScreen } from '@/features/directory/components/manufacturer-detail-screen';
import { manufacturerKeys } from '@/features/directory/directory.keys';
import { manufacturerDetailQuery } from '@/features/directory/manufacturers.queries';

/**
 * Manufacturer Detail.
 *
 * A sibling of the list rather than a child of it: `manufacturers.tsx` has no
 * `<Outlet/>`, and the trailing `_` in this filename is what opts the route out
 * of nesting under it while still resolving to `/directory/manufacturers/{id}`.
 * It stays inside `_authenticated/`, so the guard and `AppShell` still apply.
 * The same shape as Product Detail.
 */
export const Route = createFileRoute('/_authenticated/directory/manufacturers_/$manufacturerId')({
  // The crumb the nav tree cannot supply — this screen is not a nav target.
  // See `findNavSubtree` in nav-config.ts for the other half.
  staticData: { breadcrumb: 'Manufacturer Detail' },
  loader: async ({ context, params }) => {
    const id = Number(params.manufacturerId);
    // A junk id is a 404, not a request. Guarding here rather than in a `parse`
    // keeps `Route.useParams()` a plain string and the link call sites simple.
    if (!Number.isInteger(id) || id <= 0) throw notFound();

    try {
      // One request answers the record, the `Company` identity behind it and
      // that company's address book — so there is nothing to prefetch beside
      // it the way Product Detail warms its bill of materials.
      return await context.queryClient.ensureQueryData(manufacturerDetailQuery(id));
    } catch (error) {
      // A manufacturer that does not exist and one belonging to another
      // organization are deliberately indistinguishable. Both want the
      // not-found screen.
      if (isNotFound(error)) throw notFound();
      throw error;
    }
  },
  errorComponent: ({ error }) => <ManufacturerDetailError message={errorMessage(error)} />,
  notFoundComponent: () => (
    <ManufacturerDetailError message="That manufacturer no longer exists, or you do not have access to it." />
  ),
  component: ManufacturerDetailPage,
});

function ManufacturerDetailPage() {
  const { manufacturerId } = Route.useParams();
  const navigate = Route.useNavigate();
  const id = Number(manufacturerId);

  // The loader has already resolved this, so `data` is present on first paint.
  const manufacturer = useQuery(manufacturerDetailQuery(id)).data!;

  // One derived boolean, computed once and threaded down. Two props is how the
  // record card and the address book end up disagreeing about who may write.
  // Writes against a row this organization does not own are 404s, so offering
  // the controls would only teach that on submit.
  const canWrite = canManageOrgRecords(useAuth().user?.role) && manufacturer.is_owned;

  return (
    <div className="p-6">
      <PageTitle />
      <ManufacturerDetailScreen
        manufacturer={manufacturer}
        canManage={canWrite}
        onEdit={() => {
          void navigate({
            to: '/directory/manufacturers/$manufacturerId/edit',
            params: { manufacturerId },
          });
        }}
      />

      {/*
        The company's id, not the manufacturer's. They are unrelated integers,
        and the address endpoints put the owning organization in the URL on
        purpose — that identity may be shared with this organization's facility
        and tenant rows.
      */}
      <CompanyAddressesCard
        companyId={manufacturer.company.id}
        addresses={manufacturer.company.addresses}
        canManage={canWrite}
        roleNoun="manufacturer"
        // The detail documents, not the listing: an address cannot change a
        // table showing a name and whether a barcode exists, and evicting
        // `catalogKeys` would throw away a warm Receive-picker cache for a
        // change that cannot reach it.
        invalidates={[manufacturerKeys.details()]}
      />
    </div>
  );
}

/**
 * `‹ Manufacturer Detail`.
 *
 * History rather than a link when there is history to go back to: the list
 * holds a search term and a page in its URL, and `retainSearchParams` keeps
 * only `page_size` across a navigation. A plain `<Link>` back would silently
 * discard the search of anyone who had narrowed the table — which is exactly
 * the person who came here from it.
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
          <Link to="/directory/manufacturers">
            <ChevronLeftIcon />
          </Link>
        </Button>
      )}
      <h1 className="text-2xl font-semibold text-primary">Manufacturer Detail</h1>
    </div>
  );
}

function ManufacturerDetailError({ message }: { message: string }) {
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
