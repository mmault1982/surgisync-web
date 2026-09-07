import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { createPart, partialUpdatePart } from '@/api/generated/endpoints/inventory/inventory';
import { type PartDetail } from '@/api/generated/model';
import { Button } from '@/components/ui/button';
import { catalogKeys } from '@/features/inventory/inventory.keys';

import { productCatalogKeys } from '../catalog.keys';
import {
  buildProductBody,
  buildProductPatch,
  hasProductErrors,
  initialProductValues,
  isUnchanged,
  productFieldErrors,
  productSaveErrorMessage,
  seedProductValues,
  validateProduct,
  type ProductErrors,
  type ProductValues,
} from '../product';
import { ProductFields } from './product-fields';

/**
 * Add a product, or amend one.
 *
 * One component for create and edit. They differ in three places — the
 * heading, whether `kind` is editable, and the request — and two
 * near-identical seven-field forms is how the required markers on one of them
 * go stale.
 *
 * A page rather than a `Dialog`, unlike the Directory screens' create/edit.
 * `NameDialog`'s docstring says a second writable field is where sharing that
 * component should stop; this has seven, and the prototype's `.form-card` — a
 * two-column grid with a full-width submit — is a page layout, not a modal.
 * The seven controls themselves are `ProductFields`, shared with the Receive
 * form's Add product dialog; what stays here is the page furniture and the
 * create/edit mutation.
 *
 * Presentational: it takes the part and its callbacks as props, so it renders
 * without a router. Navigation lives in the route files.
 *
 * State is `useState` plus the pure validator in `product.ts`, the idiom every
 * form here but `login-form.tsx` uses — there is no shadcn `form.tsx` in this
 * project, and `Field` is the house Form primitive.
 */
export function ProductFormScreen({
  part,
  onCancel,
  onSaved,
}: {
  /** The part being amended, or null to add a new one. */
  part: PartDetail | null;
  onCancel: () => void;
  onSaved: (saved: PartDetail) => void;
}) {
  const queryClient = useQueryClient();

  const [values, setValues] = useState<ProductValues>(() =>
    part ? seedProductValues(part) : initialProductValues(),
  );
  const [submitted, setSubmitted] = useState(false);

  const save = useMutation({
    // One request. A retried POST files a second part under the same catalog
    // number, and the uniqueness constraint is partial — a soft-deleted
    // neighbour would not stop it.
    retry: false,
    mutationFn: () =>
      part
        ? partialUpdatePart(part.id, buildProductPatch(values, part))
        : createPart(buildProductBody(values)),
    onSuccess: async (saved) => {
      // Both roots. `catalogKeys` is the Receive form's picker cache, which
      // reads the same endpoint under a separate root with a five-minute
      // staleTime — without this, a part added here would not be receivable
      // for five minutes.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: productCatalogKeys.all }),
        queryClient.invalidateQueries({ queryKey: catalogKeys.all }),
      ]);
      onSaved(saved);
    },
  });

  const clientErrors = validateProduct(values);
  // The server wins the slot: its message is about the value it actually saw,
  // and all three uniqueness rules are only answerable there.
  const serverErrors = productFieldErrors(save.error);
  const shown: ProductErrors = submitted ? { ...clientErrors, ...serverErrors } : serverErrors;

  const disabled = save.isPending;

  function update<K extends keyof ProductValues>(field: K, value: ProductValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (hasProductErrors(clientErrors)) return;
    // Nothing to send is not a failed save: leave as though it had succeeded,
    // rather than making the user cancel out of a form they did not change.
    if (part && isUnchanged(values, part)) {
      onSaved(part);
      return;
    }
    save.mutate();
  }

  return (
    <form onSubmit={submit} noValidate className="max-w-3xl">
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <ProductFields
          values={values}
          errors={shown}
          disabled={disabled}
          kindLocked={part !== null}
          kindHint={part ? ' (fixed after creation)' : undefined}
          onChange={update}
        />

        {save.error && !hasProductErrors(serverErrors) ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {productSaveErrorMessage(save.error)}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={disabled}>
            Cancel
          </Button>
          <Button type="submit" disabled={disabled}>
            {disabled ? (
              <span
                className="size-5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
                role="status"
                aria-label="Saving"
              />
            ) : part ? (
              'Save'
            ) : (
              'Add product'
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
