import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { asFieldErrors, errorMessage } from '@/api/errors';
import {
  createSurgeonCatalog,
  partialUpdateSurgeon,
} from '@/api/generated/endpoints/inventory/inventory';
import type { SurgeonCatalog } from '@/api/generated/model';
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

import { surgeonKeys } from '../directory.keys';
import {
  MAX_NAME_LENGTH,
  buildSurgeonBody,
  hasSurgeonErrors,
  initialSurgeonValues,
  isUnchanged,
  seedSurgeonValues,
  surgeonFieldErrors,
  validateSurgeon,
  type SurgeonValues,
} from '../surgeons';

/**
 * Add a surgeon, or amend one.
 *
 * Its own component rather than `NameDialog`, which is single-field by
 * construction — its docstring says a second field is exactly where sharing
 * should stop, because the alternative is a `fields` prop and a dialog nobody
 * can read to find out what it asks for. Manufacturers and procedures keep
 * using the shared one.
 *
 * Mounted only while open, so a draft cannot outlive a close.
 */
export function SurgeonDialog({
  surgeon,
  onClose,
}: {
  /** The row being amended, or null to add a new one. */
  surgeon: SurgeonCatalog | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<SurgeonValues>(() =>
    surgeon ? seedSurgeonValues(surgeon) : initialSurgeonValues(),
  );
  const [submitted, setSubmitted] = useState(false);

  const save = useMutation({
    // One request. A retried POST files a second surgeon, and with the NPI
    // optional there may be nothing on the row to notice the duplicate by.
    retry: false,
    mutationFn: () => {
      const body = buildSurgeonBody(values);
      return surgeon ? partialUpdateSurgeon(surgeon.id, body) : createSurgeonCatalog(body);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: surgeonKeys.all });
      onClose();
    },
  });

  const clientErrors = validateSurgeon(values);
  // The server wins the slot, and which slot it picks is its judgement: a
  // duplicate NPI lands on npi_number, a duplicate name on name.
  const serverErrors = surgeonFieldErrors(save.error);
  const shown = submitted ? { ...clientErrors, ...serverErrors } : serverErrors;

  function update<K extends keyof SurgeonValues>(field: K, value: SurgeonValues[K]) {
    setValues((previous) => ({ ...previous, [field]: value }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (hasSurgeonErrors(clientErrors)) return;
    if (surgeon && isUnchanged(values, surgeon)) {
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
            <DialogTitle>{surgeon ? 'Amend surgeon' : 'Add surgeon'}</DialogTitle>
            <DialogDescription>
              Visible to your organization only. A surgeon already on the shared roster counts as a
              duplicate.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <Field label="Name" required htmlFor="surgeon-name" error={shown.name}>
              <Input
                id="surgeon-name"
                value={values.name}
                maxLength={MAX_NAME_LENGTH}
                autoFocus
                onChange={(event) => update('name', event.target.value)}
              />
            </Field>

            <Field label="NPI" hint=" (optional)" htmlFor="surgeon-npi" error={shown.npiNumber}>
              <Input
                id="surgeon-npi"
                value={values.npiNumber}
                // Not `type="number"`: an NPI is a 10-digit identifier, not a
                // quantity, and a number input strips leading zeros and offers
                // a spinner for something nobody increments.
                inputMode="numeric"
                maxLength={10}
                placeholder="10 digits"
                onChange={(event) => update('npiNumber', event.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                When given, this is what identifies the surgeon — so two people sharing a name can
                both be recorded.
              </p>
            </Field>
          </div>

          {save.error && !hasSurgeonErrors(serverErrors) ? (
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
              ) : surgeon ? (
                'Save'
              ) : (
                'Add surgeon'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** What the server said that neither field could show. */
function saveErrorMessage(error: unknown): string {
  for (const [field, messages] of Object.entries(asFieldErrors(error) ?? {})) {
    const first = messages[0];
    if (field !== 'name' && field !== 'npi_number' && first) return first;
  }
  return errorMessage(error);
}
