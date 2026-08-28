import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { PartList } from '@/api/generated/model';
import { asFieldErrors, errorMessage } from '@/api/errors';
import { Field } from '@/components/field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

import { parseQuantity, validateQuantity } from '../kit-components';
import { lookupByReference, partLabel, resolveCatalogNumber } from '../part-lookup';

/**
 * Add a catalog part to a kit's bill of materials.
 *
 * **The part is found, not picked.** The user types the catalog number printed
 * on it and the field resolves to one part, which is the same call the Receive
 * SKU form makes and the reason `part-lookup.ts` exists — a picker over a
 * catalog of thousands is a worse control than the number already in the user's
 * hand, and there is no combobox primitive in this project to build one from.
 *
 * Resolution is scoped to the **kit's** manufacturer: `reference_number` is
 * unique per manufacturer rather than across the catalog, so a number can match
 * more than one part, and a component filed under a different manufacturer than
 * the kit holding it is a mistake worth naming rather than silently accepting.
 */
export function AddComponentDialog({
  kitManufacturerId,
  onAdd,
  invalidates,
  onClose,
}: {
  /** The kit's manufacturer, which the typed number must resolve within. */
  kitManufacturerId: number;
  onAdd: (item: number, quantity: number) => Promise<unknown>;
  invalidates: readonly (readonly unknown[])[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [reference, setReference] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [submitted, setSubmitted] = useState(false);
  /** The part the current number resolved to, and why it did not. */
  const [resolved, setResolved] = useState<PartList | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const lookup = useMutation({
    retry: false,
    mutationFn: (value: string) => lookupByReference(value),
  });

  const save = useMutation({
    retry: false,
    mutationFn: (part: PartList) => onAdd(part.id, parseQuantity(quantity)!),
    onSuccess: async () => {
      await Promise.all(invalidates.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      onClose();
    },
  });

  /**
   * Resolve the number as it stands, and return the part or null.
   *
   * Returns rather than only setting state, because submit needs the answer in
   * the same tick — a `setState` here would not be readable until the next
   * render, and the save would fire against a stale `resolved`.
   */
  async function resolveNow(): Promise<PartList | null> {
    const value = reference.trim();
    if (!value) {
      setResolved(null);
      setResolveError(null);
      return null;
    }
    if (resolved?.reference_number === value) return resolved;

    const page = await lookup.mutateAsync(value).catch(() => null);
    if (!page) {
      setResolved(null);
      setResolveError('Could not look that number up. Try again.');
      return null;
    }

    const resolution = resolveCatalogNumber(page.results, kitManufacturerId);
    setResolved(resolution.part);
    setResolveError(resolution.error);
    return resolution.part;
  }

  const quantityClientError = validateQuantity(quantity);
  // The server wins each slot: its message is about the values it actually saw
  // — the duplicate, the cycle and the self-reference are all things only it
  // can know.
  const fieldErrors = asFieldErrors(save.error);
  const shownReference = fieldErrors?.item?.[0] ?? resolveError ?? undefined;
  const shownQuantity = fieldErrors?.quantity?.[0] ?? (submitted ? quantityClientError : undefined);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (quantityClientError) return;

    const part = await resolveNow();
    if (!part) {
      // `resolveNow` has already set the reason, unless the field is empty.
      if (!reference.trim()) setResolveError('Enter a catalog number.');
      return;
    }
    save.mutate(part);
  }

  const busy = save.isPending || lookup.isPending;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent>
        <form onSubmit={(event) => void handleSubmit(event)} noValidate>
          <DialogHeader>
            <DialogTitle>Add component</DialogTitle>
            <DialogDescription>
              Enter the catalog number of the part to add to this kit.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <Field
              label="Reference #"
              required
              htmlFor="add-component-reference"
              error={shownReference}
            >
              <Input
                id="add-component-reference"
                value={reference}
                autoFocus
                onChange={(event) => {
                  setReference(event.target.value);
                  // A part resolved from the old number says nothing about the
                  // new one, and leaving it on screen is how a user comes to
                  // save the wrong component.
                  setResolved(null);
                  setResolveError(null);
                }}
                onBlur={() => void resolveNow()}
              />
            </Field>

            {/*
              The resolved part, echoed back. Without it the user is trusting
              that a catalog number they cannot read back means what they think
              — and the numbers differ by one character across a whole family.
            */}
            {resolved ? (
              <p className="text-sm text-muted-foreground">
                Adding <span className="font-medium text-foreground">{partLabel(resolved)}</span>
              </p>
            ) : null}

            <Field label="Quantity" required htmlFor="add-component-quantity" error={shownQuantity}>
              <Input
                id="add-component-quantity"
                inputMode="numeric"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </Field>
          </div>

          {save.error && !shownReference && !shownQuantity ? (
            <p role="alert" className="mb-2 text-sm text-destructive">
              {addErrorMessage(save.error)}
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
                'Add component'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The form-level alert: what the server said that neither field could show.
 *
 * `non_field_errors` is the one that actually arrives — a part that stopped
 * being a kit between opening this dialog and saving it.
 */
function addErrorMessage(error: unknown): string {
  for (const [field, messages] of Object.entries(asFieldErrors(error) ?? {})) {
    const first = messages[0];
    if (field !== 'item' && field !== 'quantity' && first) return first;
  }
  return errorMessage(error);
}
