import { useNavigate, useRouter } from '@tanstack/react-router';

import { useAuth } from '@/auth/auth-context';
import { AppBreadcrumb } from '@/components/app-breadcrumb';
import { AppSidebar } from '@/components/app-sidebar';
import { EnvironmentBadge } from '@/components/environment-badge';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { clearSelection } from '@/features/inventory/selection-store';

/**
 * The authenticated chrome: the nav sidebar plus a slim header.
 *
 * The brand-red bar the shell used to carry is gone — the identity and
 * sign-out that filled it now live in the sidebar footer, and the sidebar
 * header already asserts the brand. What is left is the toggle, the breadcrumb
 * and the environment badge.
 *
 * Sign-out stays here rather than in `NavUser`: the ordering below is an auth
 * invariant, and keeping it in one place means the menu is a presentational
 * component that tests without an auth store or a router.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const router = useRouter();
  const navigate = useNavigate();

  async function handleSignOut() {
    await auth.logout();
    // Module-scope state outlives the session. Left behind, the next user to
    // sign in on this tab sees "7 selected" against another organization's ids
    // — every checkbox unchecked, and no way to clear the count. Cleared here
    // rather than in auth-store.ts, which must not import a feature.
    clearSelection();
    await router.invalidate();
    await navigate({ to: '/login' });
  }

  return (
    // `SidebarMenuButton`'s collapsed-state tooltips need a provider, and this
    // build of the shadcn sidebar no longer ships one inside SidebarProvider.
    <TooltipProvider>
      {/* 16.25rem is the prototype's 260px; shadcn defaults to 16rem. It has to
          be set here — SidebarProvider writes the property on its own wrapper,
          so a :root declaration would lose. */}
      <SidebarProvider style={{ '--sidebar-width': '16.25rem' } as React.CSSProperties}>
        <AppSidebar user={auth.user} onSignOut={() => void handleSignOut()} />
        <SidebarInset>
          {/* h-14 matches the sidebar header, so the two bottom borders line up. */}
          <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
            <AppBreadcrumb />
            <div className="ml-auto flex items-center gap-3">
              <EnvironmentBadge />
            </div>
          </header>
          {children}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
