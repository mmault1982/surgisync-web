import { useCallback, useEffect, useState } from "react";
import { displayName, errorMessage, type Representative } from "../api/types";
import { useSession } from "../auth/SessionContext";

type LoadState =
  | { status: "loading" }
  | { status: "loaded"; reps: Representative[] }
  | { status: "failed"; message: string };

export function RepresentativesPage() {
  const session = useSession();
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });

  const load = useCallback(async () => {
    setLoadState({ status: "loading" });
    try {
      const reps = await session.api.representatives();
      setLoadState({ status: "loaded", reps });
    } catch (thrown) {
      // A dead refresh token flips the session to loggedOut via onAuthFailure,
      // so this failure state is only briefly visible in that case.
      setLoadState({ status: "failed", message: errorMessage(thrown) });
    }
  }, [session.api]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-dvh bg-surface">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <h1 className="text-xl font-semibold text-gray-900">Representatives</h1>
          <button
            type="button"
            onClick={() => void session.logout()}
            className="font-medium text-brand hover:text-brand-dark"
          >
            Log Out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-6">
        <Body loadState={loadState} onRetry={() => void load()} />
      </main>
    </div>
  );
}

function Body({ loadState, onRetry }: { loadState: LoadState; onRetry: () => void }) {
  switch (loadState.status) {
    case "loading":
      return (
        <div className="flex justify-center py-16" role="status" aria-label="Loading">
          <span className="size-8 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
        </div>
      );
    case "failed":
      return (
        <div className="py-16 text-center">
          <p className="font-medium text-gray-900">Couldn’t load representatives</p>
          <p className="mt-1 text-sm text-gray-500">{loadState.message}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 rounded-full bg-brand px-6 py-2 font-medium text-white hover:bg-brand-dark"
          >
            Retry
          </button>
        </div>
      );
    case "loaded":
      if (loadState.reps.length === 0) {
        return (
          <div className="py-16 text-center">
            <p className="font-medium text-gray-900">No representatives</p>
            <p className="mt-1 text-sm text-gray-500">
              Your organization has no active representatives.
            </p>
          </div>
        );
      }
      return (
        <ul className="divide-y divide-gray-100 rounded-xl bg-white shadow-sm">
          {loadState.reps.map((rep) => (
            <li key={rep.id} data-testid="rep-row" className="px-5 py-3">
              <p className="text-gray-900">{displayName(rep)}</p>
              <p className="text-sm text-gray-500">{rep.email}</p>
            </li>
          ))}
        </ul>
      );
  }
}
