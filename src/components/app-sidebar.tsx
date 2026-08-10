import { Link } from '@tanstack/react-router';

import type { WebUser } from '@/api/generated/model';
import logo from '@/assets/inside_app_logo.png';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';

export function AppSidebar({ user, onSignOut }: { user: WebUser | null; onSignOut: () => void }) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/inventory/on-hand">
                {/*
                 * The wordmark is 499×140, so at icon-rail width (3rem) it does
                 * not fit. Swap in the prototype's 32px brand square instead of
                 * letting it overflow or squash.
                 */}
                <img
                  src={logo}
                  alt="SurgiSync"
                  className="h-8 group-data-[collapsible=icon]:hidden"
                />
                <span
                  aria-hidden="true"
                  className="hidden size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground group-data-[collapsible=icon]:flex"
                >
                  S
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavMain />
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <NavUser user={user} onSignOut={onSignOut} />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
