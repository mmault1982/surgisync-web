import { useMutation, useQueryClient } from '@tanstack/react-query';

import { errorMessage } from '@/api/errors';
import { detachInventoryKitTracker } from '@/api/generated/endpoints/inventory/inventory';
import type { InventoryKitDetail } from '@/api/generated/model';
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

import { stockItemKeys } from '../inventory.keys';

/**
 * Confirm before detaching a kit's beacon.
 *
 * `AlertDialog` rather than the `Dialog` the four action dialogs use: this
 * interrupts to ask a yes/no question about something already decided, which is
 * exactly the role split between the two Radix primitives. It also traps focus
 * on the cancel action by default, which is the right default for a
 * destructive-ish confirm.
 *
 * Worth confirming at all because detaching is easy to hit by accident and its
 * effect is silent — the kit simply stops reporting where it is, with nothing
 * on screen to say so afterwards. Mobile asks first for the same reason, and
 * this reuses its copy.
 */
export function DetachTrackerDialog({
  kit,
  onClose,
}: {
  kit: InventoryKitDetail;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const detach = useMutation({
    retry: false,
    mutationFn: () => detachInventoryKitTracker(kit.id),
    onSuccess: () => {
      // Drops the Live Location panel and brings the Add Hansel Tracker action
      // back, both off `kit.tracker`. One prefix does it.
      void queryClient.invalidateQueries({ queryKey: stockItemKeys.all });
      onClose();
    },
  });

  return (
    <AlertDialog
      open
      onOpenChange={(next) => {
        // A request in flight is not cancellable, so do not let the overlay or
        // Escape close the dialog out from under it.
        if (!next && !detach.isPending) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Detach tracker?</AlertDialogTitle>
          <AlertDialogDescription>
            This kit will stop reporting its location. The tracker can be attached to another kit
            afterwards.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {detach.error ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(detach.error)}
          </p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={detach.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={detach.isPending}
            // Not the default close-on-click: the dialog has to survive a
            // failure so the error above has somewhere to render.
            onClick={(event) => {
              event.preventDefault();
              detach.mutate();
            }}
          >
            {detach.isPending ? (
              <span
                className="size-5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
                role="status"
                aria-label="Detaching"
              />
            ) : (
              'Detach'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
