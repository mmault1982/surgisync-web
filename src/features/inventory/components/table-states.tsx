/**
 * Loading, empty and error states.
 *
 * The prototype has none of the three: with a filter applied that matches
 * nothing it renders a header, no rows, and a footer still claiming "Showing
 * 1-8 of 8". With ten filter dimensions an accidental zero-result is easy, so
 * the empty state has to say which case it is and offer the way out.
 */
export function TableLoading() {
  return (
    <div className="p-12 text-center text-sm text-gray-500">
      <span
        role="status"
        aria-label="Loading inventory"
        className="mx-auto block size-6 animate-spin rounded-full border-2 border-brand/30 border-t-brand"
      />
    </div>
  );
}

export function TableEmpty({
  filtered,
  onClearFilters,
}: {
  filtered: boolean;
  onClearFilters: () => void;
}) {
  if (!filtered) {
    return (
      <div className="p-12 text-center">
        <p className="font-medium text-gray-900">No inventory yet</p>
        <p className="mt-1 text-sm text-gray-600">Stock you receive will appear here.</p>
      </div>
    );
  }

  return (
    <div className="p-12 text-center">
      <p className="font-medium text-gray-900">No kits match these filters</p>
      <p className="mt-1 text-sm text-gray-600">Try removing one, or clear them all.</p>
      <button
        type="button"
        onClick={onClearFilters}
        className="mt-4 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
      >
        Clear all filters
      </button>
    </div>
  );
}

export function TableError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="p-12 text-center">
      <p className="font-medium text-gray-900">Could not load inventory</p>
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
