/**
 * Server-driven pagination.
 *
 * The prototype's footer is decorative — static "Showing 1-8 of 8" markup with
 * no handler, and the row list is never sliced — so it would lie the moment
 * there were more rows than a page.
 */
export function Pagination({
  page,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalItems === 0) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 text-sm">
      <p className="text-gray-600">
        Showing {first}–{last} of {totalItems}
      </p>
      <div className="flex items-center gap-2">
        <PageButton disabled={page <= 1} onClick={() => onPageChange(page - 1)} label="‹" />
        <span className="text-gray-700">
          Page {page} of {totalPages}
        </span>
        <PageButton
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          label="›"
        />
      </div>
    </div>
  );
}

function PageButton({
  disabled,
  onClick,
  label,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label === '‹' ? 'Previous page' : 'Next page'}
      className="rounded border border-gray-200 px-2 py-1 disabled:opacity-40 disabled:pointer-events-none hover:border-brand hover:text-brand"
    >
      {label}
    </button>
  );
}
