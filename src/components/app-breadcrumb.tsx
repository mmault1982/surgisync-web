import { Link, useRouterState } from '@tanstack/react-router';

import { findNavSubtree } from '@/components/nav-config';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

/**
 * The prototype's `Inventory › Manage On-Hand`, gaining a third crumb on a
 * detail screen: `Inventory › Manage On-Hand › Kit Detail`.
 *
 * The first two come from the same nav tree the sidebar renders, so the two
 * cannot disagree. The leaf comes from the route's own `staticData`, because a
 * screen that is not in the nav has no entry there to read a title from.
 */
export function AppBreadcrumb() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const leaf = useRouterState({ select: (state) => state.matches.at(-1)?.staticData.breadcrumb });
  const trail = findNavSubtree(pathname);

  if (!trail) return null;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem className="hidden sm:block">{trail.section.title}</BreadcrumbItem>
        <BreadcrumbSeparator className="hidden sm:block" />
        <BreadcrumbItem>
          {leaf ? (
            // The screen you came from, and the way back to it.
            <BreadcrumbLink asChild>
              <Link to={trail.item.to}>{trail.item.title}</Link>
            </BreadcrumbLink>
          ) : (
            <BreadcrumbPage>{trail.item.title}</BreadcrumbPage>
          )}
        </BreadcrumbItem>
        {leaf ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{leaf}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : null}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
