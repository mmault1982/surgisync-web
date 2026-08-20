import { useMutation, useQueryClient } from '@tanstack/react-query';

import { asConflict, errorMessage } from '@/api/errors';
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

/**
 * Confirm before removing a record.
 *
 * `AlertDialog` rather than `Dialog`: it interrupts to ask a yes/no question
 * about something already decided, which is the split between the two Radix
 * primitives, and it focuses Cancel by default.
 *
 * Started in the Directory Profiles feature, where the three entities differed
 * only in their conflict code and their copy. It knows nothing about directory
 * records, and Configuration / Hansel was the caller that proved it — the same
 * move, for the same reason, as `field.tsx`.
 *
 * The copy avoids "permanently": none of these servers promise it, and the one
 * caller whose delete really is destructive says so in its own words.
 */
export function DeleteDialog({
  title,
  description,
  conflictCode,
  onDelete,
  invalidates,
  onClose,
}: {
  title: string;
  description: string;
  /**
   * The 409 `error` code this entity refuses with, e.g. `procedure_in_use`.
   * Branching on the code rather than the prose is the house rule; the
   * server's `message` carries the counts and is what gets rendered.
   *
   * Optional because not every delete has something to refuse for. Omitted,
   * every failure renders through `errorMessage()` — which is also what a 409
   * carrying some *other* code falls back to.
   */
  conflictCode?: string;
  onDelete: () => Promise<unknown>;
  invalidates: readonly (readonly unknown[])[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const remove = useMutation({
    // A 409 is a decision for the user, not something to re-send.
    retry: false,
    mutationFn: () => onDelete(),
    onSuccess: async () => {
      await Promise.all(invalidates.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      onClose();
    },
  });

  const conflict = asConflict(remove.error);
  const message = remove.error
    ? conflictCode && conflict?.error === conflictCode
      ? conflict.message
      : errorMessage(remove.error)
    : null;

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
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {message ? (
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={remove.isPending}
            // Not the default close-on-click: the dialog has to survive a
            // failure so the message above has somewhere to render — and the
            // failure that matters, a record something still references, is
            // the one the user most needs to read.
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
