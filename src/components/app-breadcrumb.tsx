import { useRouterState } from '@tanstack/react-router';

import { findNavTrail } from '@/components/nav-config';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

/**
 * The prototype's `Inventory › Manage On-Hand`. Derived from the same nav tree
 * the sidebar renders, so the two cannot disagree.
 */
export function AppBreadcrumb() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const trail = findNavTrail(pathname);

  if (!trail) return null;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem className="hidden sm:block">{trail.section.title}</BreadcrumbItem>
        <BreadcrumbSeparator className="hidden sm:block" />
        <BreadcrumbItem>
          <BreadcrumbPage>{trail.item.title}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
