import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { createPart } from '@/api/generated/endpoints/inventory/inventory';
import type { PartDetail } from '@/api/generated/model';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { catalogKeys } from '@/features/inventory/inventory.keys';

import { productCatalogKeys } from '../catalog.keys';
import {
  buildProductBody,
  hasProductErrors,
  initialProductValues,
  productFieldErrors,
  productSaveErrorMessage,
  validateProduct,
  type ProductErrors,
  type ProductValues,
} from '../product';
import { ProductFields } from './product-fields';

/**
 * Create the catalog part a typed catalog number failed to find.
 *
 * The Receive form's way out of a dead end: a number that matches nothing used
 * to leave the user with a warning and no next step but to abandon the
 * delivery, add the product on the Product Catalog screen and start over.
 *
 * The same seven controls as that screen — `ProductFields`, shared rather than
 * copied — seeded with everything Receive already knows, so the description is
 * usually the only thing left to type. A `Dialog` rather than the page it
 * borrows from because the point is *not* to leave the receive in progress.
 *
 * Only offered to callers the server would accept: `POST /api/v1/parts/` is
 * `IsOrganizationAdmin`, and the gate lives at the call site with the button.
 */
export function AddProductDialog({
  seed,
  onCreated,
  onClose,
}: {
  /** What Receive already knows: its manufacturer, and the number that found nothing. */
  seed: { manufacturerId: number | null; referenceNumber: string };
  onCreated: (part: PartDetail) => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  // Seeded once, on mount. The dialog is mounted only while open, so every
  // open reseeds from the form as it stands and no draft outlives a close.
  //
  // `kind` needs no special case: `initialProductValues()` is already
  // `component`, which is the only thing a part carrying a catalog number can
  // be — kits carry none.
  const [values, setValues] = useState<ProductValues>(() => ({
    ...initialProductValues(),
    manufacturer: seed.manufacturerId === null ? '' : String(seed.manufacturerId),
    referenceNumber: seed.referenceNumber,
  }));
  const [submitted, setSubmitted] = useState(false);

  const save = useMutation({
    // One request. A retried POST files a second part under the same catalog
    // number, and the uniqueness constraint is partial — a soft-deleted
    // neighbour would not stop it.
    retry: false,
    mutationFn: () => createPart(buildProductBody(values)),
    onSuccess: async (created) => {
      // Both roots, as the Product Catalog's form does. `catalogKeys` matters
      // twice over here: it is the Receive form's own picker cache, so a
      // manufacturer that has just gained its first part becomes selectable
      // rather than waiting out a five-minute staleTime.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: productCatalogKeys.all }),
        queryClient.invalidateQueries({ queryKey: catalogKeys.all }),
      ]);
      onCreated(created);
    },
  });

  const clientErrors = validateProduct(values);
  // The server wins the slot: its message is about the value it actually saw,
  // and all three uniqueness rules are only answerable there. A duplicate
  // catalog number is the one this dialog will actually meet — it means the
  // part exists under a manufacturer the lookup did not search.
  const serverErrors = productFieldErrors(save.error);
  const shown: ProductErrors = submitted ? { ...clientErrors, ...serverErrors } : serverErrors;

  const busy = save.isPending;

  function update<K extends keyof ProductValues>(field: K, value: ProductValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    // `DialogContent` portals to `document.body`, so this form is not nested in
    // the DOM — but a React portal still bubbles events through the *React*
    // tree, so a caller that renders this dialog from inside its own <form>
    // would have that form submit too. Opening this from a form is the whole
    // point of it, so the guard belongs here rather than in each caller.
    event.stopPropagation();
    setSubmitted(true);
    if (hasProductErrors(clientErrors)) return;
    save.mutate();
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      {/* Wider than the default `sm:max-w-lg`, which cannot hold the two-column grid. */}
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Add product</DialogTitle>
            <DialogDescription>
              Create the catalog entry for this number, then carry on receiving it.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <ProductFields
              values={values}
              errors={shown}
              disabled={busy}
              kindLocked
              kindHint=" (components only)"
              onChange={update}
            />
          </div>

          {save.error && !hasProductErrors(serverErrors) ? (
            <p role="alert" className="mb-2 text-sm text-destructive">
              {productSaveErrorMessage(save.error)}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? (
                <span
                  className="size-5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
                  role="status"
                  aria-label="Saving"
                />
              ) : (
                'Add product'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
