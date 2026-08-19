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

import { MAX_NAME_LENGTH, isUnchanged, validateName } from '../name';

/**
 * Add a directory record, or rename one.
 *
 * One component for add and rename, because they are the same single field
 * over the same validation and differ only in which request they send and what
 * the form is seeded from. One component for *both entities* for the same
 * reason: a manufacturer and a procedure are each exactly one writable field,
 * so the difference between their dialogs was two mutation calls and some
 * copy.
 *
 * Mounted only while open, so a draft name cannot outlive a close and every
 * open reseeds from the row.
 *
 * If a third entity turns out to need a second field, this is the moment to
 * stop generalising and let it have its own — the shape is worth sharing only
 * while it genuinely is the same shape.
 */
export function NameDialog({
  title,
  description,
  initialName,
  isRename,
  onSave,
  invalidates,
  onClose,
}: {
  title: string;
  description: string;
  /** Empty to add; the current name to rename. */
  initialName: string;
  isRename: boolean;
  onSave: (name: string) => Promise<unknown>;
  invalidates: readonly (readonly unknown[])[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(initialName);
  const [submitted, setSubmitted] = useState(false);

  const save = useMutation({
    // One request. A retried POST files a second record under the same name,
    // and unlike a kit there is no id on it for the user to notice by.
    retry: false,
    mutationFn: () => onSave(name.trim()),
    onSuccess: async () => {
      await Promise.all(invalidates.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      onClose();
    },
  });

  const clientError = validateName(name);
  // The server wins the slot: its message is about the value it actually saw —
  // most often the uniqueness clash, which only it can know about.
  const serverError = asFieldErrors(save.error)?.name?.[0];
  const shown = serverError ?? (submitted ? clientError : undefined);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (clientError) return;
    // Nothing to send, so nothing to fail: closing is the honest response to
    // "save" on a form the user has not changed.
    if (isRename && isUnchanged(name, initialName)) {
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
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Field label="Name" required htmlFor="directory-name" error={shown}>
              <Input
                id="directory-name"
                value={name}
                maxLength={MAX_NAME_LENGTH}
                autoFocus
                onChange={(event) => setName(event.target.value)}
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
              ) : isRename ? (
                'Save'
              ) : (
                title
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
 * `name` is the only slot, so anything keyed differently — `non_field_errors`
 * from a user with no organization, say — would otherwise go unshown.
 */
function saveErrorMessage(error: unknown): string {
  for (const [field, messages] of Object.entries(asFieldErrors(error) ?? {})) {
    const first = messages[0];
    if (field !== 'name' && first) return first;
  }
  return errorMessage(error);
}
