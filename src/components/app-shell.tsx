import { Link, useNavigate, useRouter } from '@tanstack/react-router';

import logo from '@/assets/inside_app_logo.png';
import { useAuth } from '@/auth/auth-context';
import { EnvironmentBadge } from '@/components/environment-badge';

/**
 * The authenticated chrome: sidebar nav plus a brand header.
 *
 * Deliberately minimal for now — the prototype's full nav tree arrives with the
 * screens that need it. What matters here is that every authenticated route
 * gets the same frame and the same sign-out path.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const router = useRouter();
  const navigate = useNavigate();

  async function handleSignOut() {
    await auth.logout();
    await router.invalidate();
    await navigate({ to: '/login' });
  }

  return (
    <div className="flex min-h-dvh bg-surface">
      <aside className="flex w-64 shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="flex items-center gap-3 px-5 py-4">
          <img src={logo} alt="SurgiSync" className="h-8" />
        </div>
        <nav className="flex flex-col gap-1 px-3 py-2">
          <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Inventory
          </p>
          <Link
            to="/inventory/on-hand"
            className="rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
            activeProps={{ className: 'rounded-md px-3 py-2 text-sm bg-brand text-white' }}
          >
            Manage On-Hand
          </Link>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between bg-brand px-6 py-3 text-white">
          <span className="text-sm font-medium">SurgiSync</span>
          <div className="flex items-center gap-4">
            <EnvironmentBadge />
            <span className="text-sm">{auth.user?.name || auth.user?.email}</span>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="rounded-full px-3 py-1 text-sm ring-1 ring-inset ring-white/40 hover:bg-white/10"
            >
              Sign out
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
