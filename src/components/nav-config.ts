import type { LinkProps } from '@tanstack/react-router';
import {
  FactoryIcon,
  FolderIcon,
  StethoscopeIcon,
  UserRoundIcon,
  LayoutDashboardIcon,
  LibraryBigIcon,
  PackageIcon,
  PackageOpenIcon,
  PackagePlusIcon,
  PlugIcon,
  SettingsIcon,
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
 * The prototype's section order, as far as it is built. Five more are still to
 * come (Cases / Restocks, Ordering, Quotes, Pricing, Reports), and each arrives
 * with the screens behind it rather than as a row of dead links — which is also
 * why Directory Profiles lists just Manufacturers and Surgeons, not the
 * Facilities and Users the prototype shows beside them.
 *
 * **Configuration is not the prototype's name for it — that is "Setup"** — and
 * the difference is deliberate rather than an oversight, so do not "fix" it
 * back. If Setup ever ships as well, the two want merging under one of the two
 * names rather than sitting side by side meaning the same thing.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Directory Profiles',
    icon: FolderIcon,
    items: [
      { title: 'Manufacturers', to: '/directory/manufacturers', icon: FactoryIcon },
      { title: 'Surgeons', to: '/directory/surgeons', icon: UserRoundIcon },
    ],
  },
  {
    title: 'Inventory',
    icon: PackageIcon,
    items: [
      { title: 'Dashboard', to: '/inventory/dashboard', icon: LayoutDashboardIcon },
      // Not in the prototype, which lists only the three below. Placed second
      // because it is the reference data the other two are *about*: On-Hand
      // shows stock of these parts, and Receive / Load files new stock against
      // them.
      { title: 'Product Catalog', to: '/inventory/product-catalog', icon: LibraryBigIcon },
      { title: 'Manage On-Hand', to: '/inventory/on-hand', icon: PackageOpenIcon },
      { title: 'Receive / Load', to: '/inventory/receive', icon: PackagePlusIcon },
    ],
  },
  {
    title: 'Configuration',
    icon: SettingsIcon,
    items: [
      { title: 'Hansel', to: '/configuration/hansel', icon: PlugIcon },
      // Not in the prototype at all, under either name: it lists Facilities,
      // Manufacturers, Surgeons and Users under Directory Profiles and says
      // nothing about procedures. A deliberate addition, and it sits here
      // rather than beside those four because a procedure is something the
      // organization configures for its own use, not a party it deals with.
      { title: 'Procedures', to: '/configuration/procedures', icon: StethoscopeIcon },
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
