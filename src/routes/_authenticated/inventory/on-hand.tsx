import { createFileRoute } from '@tanstack/react-router';

/**
 * Manage On-Hand.
 *
 * Placeholder in this PR — the scaffold lands first so the table is written
 * against settled conventions. The real screen (typed search params for the
 * filter dimensions, TanStack Table, server-driven pagination) is the next PR.
 */
export const Route = createFileRoute('/_authenticated/inventory/on-hand')({
  component: OnHandPage,
});

function OnHandPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-brand">Manage On-Hand</h1>
      <p className="mt-2 text-sm text-gray-600">The inventory table lands in the next change.</p>
    </div>
  );
}
