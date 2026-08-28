import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

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

import { isUnchangedQuantity, parseQuantity, validateQuantity } from '../kit-components';

/**
 * How many of a component a kit contains.
 *
 * Quantity is the only editable field on a BOM row, so this is the whole edit
 * surface — pointing the row at a different part is a remove and an add, which
 * is how the server models it too.
 *
 * Modelled on `directory/components/name-dialog.tsx`, down to the error
 * precedence and the no-op close. Mounted only while open, so a draft cannot
 * outlive a close and every open reseeds from the row.
 */
export function ComponentQuantityDialog({
  label,
  initialQuantity,
  onSave,
  invalidates,
  onClose,
}: {
  /** What to call the component in the dialog's copy. */
  label: string;
  initialQuantity: number;
  onSave: (quantity: number) => Promise<unknown>;
  invalidates: readonly (readonly unknown[])[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  // A string, not a number: held as a number an empty box is indistinguishable
  // from zero. `receive-sku.ts` records the same call for the same reason.
  const [quantity, setQuantity] = useState(String(initialQuantity));
  const [submitted, setSubmitted] = useState(false);

  const save = useMutation({
    // A 400 is a decision for the user, not something to re-send.
    retry: false,
    mutationFn: () => onSave(parseQuantity(quantity)!),
    onSuccess: async () => {
      await Promise.all(invalidates.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      onClose();
    },
  });

  const clientError = validateQuantity(quantity);
  // The server wins the slot: its message is about the value it actually saw.
  const serverError = asFieldErrors(save.error)?.quantity?.[0];
  const shown = serverError ?? (submitted ? clientError : undefined);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (clientError) return;
    // Nothing to send, so nothing to fail: closing is the honest response to
    // "save" on a number the user has not changed.
    if (isUnchangedQuantity(quantity, initialQuantity)) {
      onClose();
      return;
    }
    save.mutate();
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !save.isPending) onClose();
      }}
    >
      <DialogContent>
        <form onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle>Edit quantity</DialogTitle>
            <DialogDescription>How many of {label} this kit contains.</DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Field label="Quantity" required htmlFor="component-quantity" error={shown}>
              <Input
                id="component-quantity"
                inputMode="numeric"
                value={quantity}
                autoFocus
                onChange={(event) => setQuantity(event.target.value)}
              />
            </Field>
          </div>

          {save.error && !shown ? (
            <p role="alert" className="mb-2 text-sm text-destructive">
              {saveErrorMessage(save.error)}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? (
                <span
                  className="size-5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
                  role="status"
                  aria-label="Saving"
                />
              ) : (
                'Save'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The form-level alert: what the server said that the field could not show.
 *
 * `quantity` is the only slot, so anything keyed differently would otherwise go
 * unshown — `non_field_errors` from a part that stopped being a kit between
 * opening this dialog and saving it, say.
 */
function saveErrorMessage(error: unknown): string {
  for (const [field, messages] of Object.entries(asFieldErrors(error) ?? {})) {
    const first = messages[0];
    if (field !== 'quantity' && first) return first;
  }
  return errorMessage(error);
}
