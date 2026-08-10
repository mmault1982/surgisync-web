import { ChevronsUpDownIcon, LogOutIcon } from 'lucide-react';

import type { WebUser } from '@/api/generated/model';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { displayName, initials } from '@/lib/user-display';

/**
 * The signed-in user, pinned to the bottom of the sidebar, with the account
 * menu behind it. `Sign out` is the only command for now.
 *
 * This is a `DropdownMenu`, not the `Popover` that CLAUDE.md prescribes for the
 * table's filter panels — a list of commands with no form controls is exactly
 * the case `DropdownMenu` is for, and `menuitem` semantics are right here where
 * they were wrong there.
 *
 * Presentational on purpose: `AppShell` still owns the sign-out sequence, which
 * keeps the auth invariants in one place and lets this be tested with no auth
 * store, no router and no MSW.
 */
export function NavUser({ user, onSignOut }: { user: WebUser | null; onSignOut: () => void }) {
  const { isMobile } = useSidebar();

  const name = displayName(user);
  const email = user?.email ?? '';

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
            >
              <UserSummary user={user} name={name} email={email} />
              <ChevronsUpDownIcon className="ml-auto size-4" />
              {/*
               * A stable handle for the tests. Matching the visible label would
               * mean matching seeded fixture data, and `aria-label` would hide
               * the name from assistive tech rather than adding to it.
               */}
              <span className="sr-only">Account menu</span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <UserSummary user={user} name={name} email={email} />
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {/* onSelect, not onClick, so Enter and Space work too. */}
            <DropdownMenuItem onSelect={onSignOut}>
              <LogOutIcon />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function UserSummary({ user, name, email }: { user: WebUser | null; name: string; email: string }) {
  return (
    <>
      {/* Hidden from the accessible name: the initials are a picture of the
          name that follows, so announcing "OA Org Admin" is pure noise. */}
      <Avatar aria-hidden="true" className="size-8 rounded-lg">
        <AvatarFallback className="rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          {initials(user)}
        </AvatarFallback>
      </Avatar>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{name}</span>
        <span className="truncate text-xs text-muted-foreground">{email}</span>
      </div>
    </>
  );
}
