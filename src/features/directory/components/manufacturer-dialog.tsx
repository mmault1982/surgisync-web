import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import {
  createManufacturer,
  partialUpdateManufacturer,
} from '@/api/generated/endpoints/inventory/inventory';
import type { Manufacturer } from '@/api/generated/model';
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

import { catalogKeys } from '@/features/inventory/inventory.keys';

import { manufacturerKeys } from '../directory.keys';
import {
  MAX_NAME_LENGTH,
  buildManufacturerBody,
  hasManufacturerErrors,
  initialManufacturerValues,
  isUnchanged,
  manufacturerFieldErrors,
  manufacturerSaveErrorMessage,
  seedManufacturerValues,
  validateManufacturer,
  type ManufacturerValues,
} from '../manufacturers';

/**
 * Add a manufacturer, or rename one.
 *
 * One component for both, because they are the same single field over the same
 * validation and differ only in which request they send and what the form is
 * seeded from. Two components would be two places to add the next field.
 *
 * Mounted only while open, so the draft name cannot outlive a close and every
 * open reseeds from the row.
 */
export function ManufacturerDialog({
  manufacturer,
  onClose,
}: {
  /** The row being renamed, or null to add a new one. */
  manufacturer: Manufacturer | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<ManufacturerValues>(() =>
    manufacturer ? seedManufacturerValues(manufacturer) : initialManufacturerValues(),
  );
  const [submitted, setSubmitted] = useState(false);

  const save = useMutation({
    // One request. A retried POST files a second manufacturer under the same
    // name, and unlike a kit there is no id on it for the user to notice by.
    retry: false,
    mutationFn: () => {
      const body = buildManufacturerBody(values);
      return manufacturer
        ? partialUpdateManufacturer(manufacturer.id, body)
        : createManufacturer(body);
    },
    onSuccess: async () => {
      // Two roots, and both are load-bearing. `manufacturerKeys` is this
      // table; `catalogKeys` is the manufacturer picker on the receive forms,
      // which reads the same endpoint under a different key with a five-minute
      // staleTime. Without the second, a manufacturer added here does not
      // appear there until the cache expires — which the user reads as "it did
      // not save". This is the first screen whose writes cross two roots.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: manufacturerKeys.all }),
        queryClient.invalidateQueries({ queryKey: catalogKeys.all }),
      ]);
      onClose();
    },
  });

  const errors = validateManufacturer(values);
  const serverErrors = manufacturerFieldErrors(save.error);
  const shown = submitted ? { ...errors, ...serverErrors } : serverErrors;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (hasManufacturerErrors(errors)) return;
    // Nothing to send, so nothing to fail: closing is the honest response to
    // "save" on a form the user has not changed.
    if (manufacturer && isUnchanged(values, manufacturer)) {
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
            <DialogTitle>{manufacturer ? 'Rename manufacturer' : 'Add manufacturer'}</DialogTitle>
            <DialogDescription>
              {manufacturer
                ? 'The new name appears everywhere this manufacturer is listed.'
                : 'Available to your organization only, alongside the shared catalog.'}
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Field label="Name" required htmlFor="manufacturer-name" error={shown.name}>
              <Input
                id="manufacturer-name"
                value={values.name}
                maxLength={MAX_NAME_LENGTH}
                autoFocus
                onChange={(event) => setValues({ name: event.target.value })}
              />
            </Field>
          </div>

          {save.error && !shown.name ? (
            <p role="alert" className="mb-2 text-sm text-destructive">
              {manufacturerSaveErrorMessage(save.error)}
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
              ) : manufacturer ? (
                'Save'
              ) : (
                'Add manufacturer'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
