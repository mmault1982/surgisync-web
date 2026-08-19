import type { LinkProps } from '@tanstack/react-router';
import {
  FactoryIcon,
  FolderIcon,
  StethoscopeIcon,
  LayoutDashboardIcon,
  PackageIcon,
  PackageOpenIcon,
  PackagePlusIcon,
  type LucideIcon,
} from 'lucide-react';

/**
 * The sidebar's nav tree, as data.
 *
 * Kept out of the components so the two things that can silently drift — which
 * item is current, and what the breadcrumb says — are pure functions over one
 * source of truth, testable without mounting a router.
 *
 * `to` is typed as a router path, so a typo or a deleted route fails
 * `pnpm typecheck` rather than rendering a dead link.
 */

export interface NavItem {
  title: string;
  to: NonNullable<LinkProps['to']>;
  icon: LucideIcon;
}

export interface NavSection {
  title: string;
  icon: LucideIcon;
  items: NavItem[];
}

/**
 * The prototype's section order, as far as it is built. Six more are still to
 * come (Cases / Restocks, Ordering, Quotes, Pricing, Reports, Setup), and each
 * arrives with the screens behind it rather than as a row of dead links —
 * which is also why Directory Profiles lists only Manufacturers, not the
 * Facilities, Surgeons and Users the prototype shows beside it.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Directory Profiles',
    icon: FolderIcon,
    items: [
      { title: 'Manufacturers', to: '/directory/manufacturers', icon: FactoryIcon },
      // Not in the prototype's Directory Profiles, which lists Facilities,
      // Manufacturers, Surgeons and Users. A deliberate addition: procedures
      // are reference data an organization maintains the same way, and the
      // spec simply never covered them.
      { title: 'Procedures', to: '/directory/procedures', icon: StethoscopeIcon },
    ],
  },
  {
    title: 'Inventory',
    icon: PackageIcon,
    items: [
      { title: 'Dashboard', to: '/inventory/dashboard', icon: LayoutDashboardIcon },
      { title: 'Manage On-Hand', to: '/inventory/on-hand', icon: PackageOpenIcon },
      { title: 'Receive / Load', to: '/inventory/receive', icon: PackagePlusIcon },
    ],
  },
];

export interface NavTrail {
  section: NavSection;
  item: NavItem;
}

/**
 * The section and item a pathname belongs to, or null for anything not in the
 * nav (the login screen, a 404). Exact match: every nav target is a leaf, and a
 * prefix match would light up `/inventory/on-hand` for a future
 * `/inventory/on-hand/123`, which is a detail view, not this screen.
 */
export function findNavTrail(pathname: string): NavTrail | null {
  for (const section of NAV_SECTIONS) {
    const item = section.items.find((candidate) => candidate.to === pathname);
    if (item) return { section, item };
  }
  return null;
}

/**
 * The nav item a pathname belongs *under* — including screens that are not nav
 * targets themselves. `/inventory/on-hand/123` is Kit Detail, and it lives
 * under Manage On-Hand, which should stay highlighted while you are there.
 *
 * Deliberately a second function rather than a loosening of `findNavTrail`.
 * The two answer different questions — "is this pathname *this screen*?" versus
 * "does it live *under* this item?" — and collapsing them is how a sidebar
 * starts lighting up for routes that merely share a prefix.
 *
 * The trailing slash in the prefix test is what does that work: it keeps a
 * future `/inventory/on-hand-archive` from matching `/inventory/on-hand`.
 */
export function findNavSubtree(pathname: string): NavTrail | null {
  for (const section of NAV_SECTIONS) {
    const item = section.items.find(
      (candidate) => pathname === candidate.to || pathname.startsWith(`${candidate.to}/`),
    );
    if (item) return { section, item };
  }
  return null;
}
