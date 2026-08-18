/**
 * Loading, empty and error states for a table.
 *
 * The prototype has none of the three: with a filter applied that matches
 * nothing it renders a header, no rows, and a footer still claiming "Showing
 * 1-8 of 8". With ten filter dimensions an accidental zero-result is easy, so
 * the empty state has to say which case it is and offer the way out.
 *
 * The copy is passed in rather than written here. These began on Manage
 * On-Hand and read "No inventory yet" / "Could not load inventory"; the
 * Manufacturers screen is the second caller, and a shared component that
 * names one screen's subject is a component that gets copy-pasted instead of
 * reused. The *shape* is what is worth sharing — a centred spinner, a
 * two-line empty state, and a retry that is a real button.
 */
export function TableLoading({ label }: { label: string }) {
  return (
    <div className="p-12 text-center text-sm text-gray-500">
      <span
        role="status"
        aria-label={label}
        className="mx-auto block size-6 animate-spin rounded-full border-2 border-brand/30 border-t-brand"
      />
    </div>
  );
}

export function TableEmpty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  /** Offered only when there is something to undo — a filter, a search. */
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="p-12 text-center">
      <p className="font-medium text-gray-900">{title}</p>
      <p className="mt-1 text-sm text-gray-600">{description}</p>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

export function TableError({ title, onRetry }: { title: string; onRetry: () => void }) {
  return (
    <div className="p-12 text-center">
      <p className="font-medium text-gray-900">{title}</p>
      <p className="mt-1 text-sm text-gray-600">Something went wrong fetching this page.</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-full border border-brand px-4 py-2 text-sm font-semibold text-brand hover:bg-brand hover:text-white"
      >
        Try again
      </button>
    </div>
  );
}
