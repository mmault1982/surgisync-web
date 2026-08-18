import { useMutation, useQueryClient } from '@tanstack/react-query';

import { deleteManufacturer } from '@/api/generated/endpoints/inventory/inventory';
import type { Manufacturer } from '@/api/generated/model';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { catalogKeys } from '@/features/inventory/inventory.keys';

import { manufacturerKeys } from '../directory.keys';
import { deleteErrorMessage } from '../manufacturers';

/**
 * Confirm before removing a manufacturer.
 *
 * `AlertDialog` rather than `Dialog`: it interrupts to ask a yes/no question
 * about something already decided, which is the split between the two Radix
 * primitives, and it focuses Cancel by default.
 *
 * The copy avoids "permanently". This is a soft delete — the row stops being
 * listed and frees its name, but it stays for the history that references it —
 * and promising otherwise would be a promise the server does not keep.
 */
export function DeleteManufacturerDialog({
  manufacturer,
  onClose,
}: {
  manufacturer: Manufacturer;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const remove = useMutation({
    // A 409 is a decision for the user, not something to re-send.
    retry: false,
    mutationFn: () => deleteManufacturer(manufacturer.id),
    onSuccess: async () => {
      // Both roots, for the same reason the save dialog does it: the receive
      // forms' picker reads this endpoint under `catalogKeys` with its own
      // staleTime, and a removed manufacturer still offered there is worse
      // than one that never disappeared. Removal *is* reflected there —
      // unlike creation, which the picker's `has_items` filter hides. See the
      // note in `manufacturer-dialog.tsx`.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: manufacturerKeys.all }),
        queryClient.invalidateQueries({ queryKey: catalogKeys.all }),
      ]);
      onClose();
    },
  });

  return (
    <AlertDialog
      open
      onOpenChange={(next) => {
        // A request in flight is not cancellable, so neither Escape nor the
        // overlay may close the dialog out from under it.
        if (!next && !remove.isPending) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {manufacturer.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            It stops appearing in your organization&rsquo;s lists and pickers. Stock already
            received keeps its manufacturer.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {remove.error ? (
          <p role="alert" className="text-sm text-destructive">
            {deleteErrorMessage(remove.error)}
          </p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={remove.isPending}
            // Not the default close-on-click: the dialog has to survive a
            // failure so the message above has somewhere to render — and the
            // failure that matters here, a manufacturer that still has parts,
            // is the one the user most needs to read.
            onClick={(event) => {
              event.preventDefault();
              remove.mutate();
            }}
          >
            {remove.isPending ? (
              <span
                className="size-5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
                role="status"
                aria-label="Removing"
              />
            ) : (
              'Remove'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
