/**
 * A named screen that exists in the nav before it exists as a feature.
 *
 * Deliberately data-free: nothing here calls the API, so no operationId has to
 * join `ALLOWED_OPERATIONS` in `orval.config.ts` until the real screen lands.
 * These get replaced by a `src/features/` directory apiece, not extended.
 */
export function ComingSoon({ title, description }: { title: string; description?: string }) {
  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-semibold text-primary">{title}</h1>
      <p className="text-sm text-muted-foreground">
        {description ?? 'This screen has not been built yet.'}
      </p>
    </div>
  );
}
