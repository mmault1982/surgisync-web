import { useMutation, useQueryClient } from '@tanstack/react-query';

import { errorMessage } from '@/api/errors';
import { hanselCredentialDestroy } from '@/api/generated/endpoints/integrations/integrations';
import type { HanselCredential } from '@/api/generated/model';
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

import { hanselCredentialKeys } from '../hansel.keys';

/**
 * Confirm before removing a workspace's credentials.
 *
 * `AlertDialog` rather than `Dialog`, the split `detach-tracker-dialog.tsx`
 * records: this interrupts to ask a yes/no question about something already
 * decided, and it traps focus on Cancel by default.
 *
 * Worth confirming because the server does more than hide the row — `delete()`
 * soft-deletes *and scrubs the ciphertext*, so the secret is gone and the only
 * way back is to obtain it from Hansel again. The copy says so; "This cannot be
 * undone" on its own would understate it.
 */
export function DeleteCredentialDialog({
  credential,
  onClose,
}: {
  credential: HanselCredential;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const remove = useMutation({
    retry: false,
    mutationFn: () => hanselCredentialDestroy(credential.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: hanselCredentialKeys.all });
      onClose();
    },
  });

  return (
    <AlertDialog
      open
      onOpenChange={(next) => {
        // A request in flight is not cancellable, so neither the overlay nor
        // Escape may close the dialog out from under it.
        if (!next && !remove.isPending) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove these credentials?</AlertDialogTitle>
          <AlertDialogDescription>
            SurgiSync will stop talking to this Hansel workspace. The stored secret is destroyed,
            not just hidden — restoring the connection means getting the secret from Hansel again.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {remove.error ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(remove.error)}
          </p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={remove.isPending}
            // Not the default close-on-click: the dialog has to survive a
            // failure so the error above has somewhere to render.
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
