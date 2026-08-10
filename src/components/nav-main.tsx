import { Link, useRouterState } from '@tanstack/react-router';
import { ChevronDownIcon } from 'lucide-react';

import { NAV_SECTIONS, type NavSection } from '@/components/nav-config';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/sidebar';

/**
 * The prototype's `.nav-child.active` is solid brand, where
 * `SidebarMenuSubButton` defaults to the brand *tint* it uses for parents.
 *
 * Three things here are less arbitrary than they look:
 *
 * - **`data-[active=true]:`, not shadcn's `data-active:`.** The preset defines
 *   that variant as `:where([data-active]:not([data-active="false"]))`, and
 *   `:where()` contributes no specificity — so the base `hover:bg-sidebar-accent`
 *   (0,2,0) outranks it and hovering the current page makes it look inactive.
 *   A plain attribute selector scores 0,2,0 and wins on merit.
 * - **The `hover:` pair.** Same arithmetic one level up: `[data-active="true"]:hover`
 *   is 0,3,0, so it beats the base hover rather than tying with it and hoping
 *   for a favourable source order.
 * - **`[&>svg]:text-current`.** The base pins every sub-icon to
 *   `sidebar-accent-foreground` (brand red), which on a brand-red active row is
 *   invisible. Same modifier and same class group, so tailwind-merge drops the
 *   base outright instead of leaving two rules to fight.
 */
const ACTIVE_CHILD = [
  '[&>svg]:text-current',
  'data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground',
  'data-[active=true]:hover:bg-sidebar-primary data-[active=true]:hover:text-sidebar-primary-foreground',
].join(' ');

export function NavMain() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { state, isMobile } = useSidebar();

  // Collapsed to the icon rail, `SidebarMenuSub` is display:none — the children
  // would simply vanish. Swap in a dropdown so the rail still navigates.
  const asFlyout = state === 'collapsed' && !isMobile;

  return (
    <SidebarGroup>
      <SidebarMenu>
        {NAV_SECTIONS.map((section) =>
          asFlyout ? (
            <FlyoutSection key={section.title} section={section} pathname={pathname} />
          ) : (
            <CollapsibleSection key={section.title} section={section} pathname={pathname} />
          ),
        )}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function CollapsibleSection({ section, pathname }: { section: NavSection; pathname: string }) {
  const hasActiveChild = section.items.some((item) => item.to === pathname);

  return (
    // Uncontrolled on purpose: it opens for a deep-linked child, survives moves
    // between siblings (no remount), and a manual collapse then sticks.
    <Collapsible
      key={section.title}
      asChild
      defaultOpen={hasActiveChild}
      className="group/collapsible"
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton isActive={hasActiveChild} tooltip={section.title}>
            <section.icon />
            <span>{section.title}</span>
            <ChevronDownIcon className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {section.items.map((item) => (
              <SidebarMenuSubItem key={item.to}>
                <SidebarMenuSubButton
                  asChild
                  isActive={item.to === pathname}
                  className={ACTIVE_CHILD}
                >
                  <Link to={item.to}>
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

function FlyoutSection({ section, pathname }: { section: NavSection; pathname: string }) {
  const hasActiveChild = section.items.some((item) => item.to === pathname);

  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton isActive={hasActiveChild} tooltip={section.title}>
            <section.icon />
            <span>{section.title}</span>
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start" sideOffset={4} className="min-w-48">
          <DropdownMenuLabel>{section.title}</DropdownMenuLabel>
          {section.items.map((item) => (
            <DropdownMenuItem key={item.to} asChild>
              <Link to={item.to}>
                <item.icon />
                <span>{item.title}</span>
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}
