import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound, useCanGoBack, useRouter } from '@tanstack/react-router';
import { ChevronLeftIcon } from 'lucide-react';

import { errorMessage, isNotFound } from '@/api/errors';
import { Button } from '@/components/ui/button';
import { KitActions } from '@/features/inventory/components/kit-actions';
import { KitActivityCard } from '@/features/inventory/components/kit-activity-card';
import { KitDetailBanners } from '@/features/inventory/components/kit-detail-banners';
import { KitInfoCard } from '@/features/inventory/components/kit-info-card';
import { KitLocationPanel } from '@/features/inventory/components/kit-location-panel';
import {
  kitDetailQuery,
  kitHistoryQuery,
  trackingEventsQuery,
} from '@/features/inventory/kit-detail.queries';

/**
 * Kit Detail.
 *
 * A sibling of the on-hand list rather than a child of it: `on-hand.tsx` has no
 * `<Outlet/>`, and the trailing `_` in this filename is what opts the route out
 * of nesting under it while still resolving to `/inventory/on-hand/{id}`. It
 * stays inside `_authenticated/`, so the guard and `AppShell` still apply.
 */
export const Route = createFileRoute('/_authenticated/inventory/on-hand_/$stockItemId')({
  // The crumb the nav tree cannot supply — this screen is not a nav target.
  // See `findNavSubtree` in nav-config.ts for the other half.
  staticData: { breadcrumb: 'Kit Detail' },
  loader: async ({ context, params }) => {
    const id = Number(params.stockItemId);
    // A junk id is a 404, not a request. Guarding here rather than in a `parse`
    // keeps `Route.useParams()` a plain string and the link call sites simple.
    if (!Number.isInteger(id) || id <= 0) throw notFound();

    try {
      return await context.queryClient.ensureQueryData(kitDetailQuery(id));
    } catch (error) {
      // A kit that does not exist and a kit belonging to another organization
      // are deliberately indistinguishable. Both want the not-found screen.
      if (isNotFound(error)) throw notFound();
      throw error;
    }
  },
  errorComponent: ({ error }) => <KitDetailError message={errorMessage(error)} />,
  notFoundComponent: () => (
    <KitDetailError message="That kit no longer exists, or you do not have access to it." />
  ),
  component: KitDetailPage,
});

function KitDetailPage() {
  const { stockItemId } = Route.useParams();
  const id = Number(stockItemId);

  // The loader has already resolved this, so `data` is present on first paint.
  const kit = useQuery(kitDetailQuery(id)).data!;

  // Secondary, and deliberately not in the loader: a slow or broken change log
  // or an unreachable beacon must not hold up the kit itself.
  const history = useQuery(kitHistoryQuery(id));
  const tracking = useQuery(trackingEventsQuery(kit.tracker?.id ?? null));

  return (
    <div className="@container p-6">
      <PageTitle />
      <KitDetailBanners kit={kit} />

      {/*
        Source order is [info, right column, activity], which is exactly the
        narrow-screen stack the design calls for — actions below the info block
        and above Recent Activity — so no `order-*` is needed and the reading
        order matches the tab order at every width. Wide, explicit grid lines
        lift the right column into column two across both rows.

        A container query rather than a viewport breakpoint: the sidebar
        collapses, so the same 1280px viewport is 1020px of content expanded and
        1232px collapsed, and a viewport breakpoint is wrong for one of them.
        `minmax(0, …fr)` because grid items default to `min-width: auto`, and one
        long unbroken lot code or UDI would otherwise blow the track out.

        `grid-rows-[auto_1fr]` pins row one to the info card's own height. Left
        implicit, both rows share the spanning right column's overflow, which
        opens a gap between the info card and Recent Activity whenever the
        actions stack is the taller of the two — which is most of the time.
      */}
      <div className="grid grid-cols-1 items-start gap-5 @4xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] @4xl:grid-rows-[auto_1fr]">
        <KitInfoCard kit={kit} className="@4xl:col-start-1 @4xl:row-start-1" />

        <div className="flex flex-col gap-4 @4xl:col-start-2 @4xl:row-span-2 @4xl:row-start-1">
          <KitLocationPanel
            kit={kit}
            events={tracking.data?.results}
            isPending={tracking.isPending && kit.tracker !== null}
            isError={tracking.isError}
          />
          <KitActions kit={kit} />
        </div>

        <KitActivityCard
          entries={history.data?.results}
          isPending={history.isPending}
          isError={history.isError}
          onRetry={() => void history.refetch()}
          className="@4xl:col-start-1 @4xl:row-start-2"
        />
      </div>
    </div>
  );
}

/**
 * `‹ Kit Detail`.
 *
 * History rather than a link when there is history to go back to: the list
 * holds six filters plus sort and page in its URL, and `retainSearchParams`
 * keeps only two of them across a navigation. A plain `<Link>` back would
 * silently discard the filters of anyone who had narrowed the table — which is
 * exactly the person who came here from it.
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
          <Link to="/inventory/on-hand">
            <ChevronLeftIcon />
          </Link>
        </Button>
      )}
      <h1 className="text-2xl font-semibold text-primary">Kit Detail</h1>
    </div>
  );
}

function KitDetailError({ message }: { message: string }) {
  return (
    <div className="p-12 text-center">
      <p className="font-medium text-foreground">Could not open this kit</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" className="mt-4" asChild>
        <Link to="/inventory/on-hand">Back to Manage On-Hand</Link>
      </Button>
    </div>
  );
}
