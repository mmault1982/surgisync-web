import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { apiV1StockItemsPartialUpdate } from '@/api/generated/endpoints/inventory/inventory';
import type { InventoryKitDetail } from '@/api/generated/model';
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

import { buildTrackerPatch, canSubmitBeacon, trackerErrorMessage } from '../add-tracker';
import { stockItemKeys } from '../inventory.keys';

import { Field, KitSummary } from './dialog-parts';

/**
 * Attach a Hansel tracker to a kit that has none.
 *
 * The smallest of the four Kit Detail dialogs: one field, one PATCH, no staged
 * state to discard. Mounted only while open, like the others.
 *
 * Everything that can go wrong here is a 409 about the beacon, so there is no
 * form-level alert — the message belongs under the input, which is the only
 * thing the user can act on.
 */
export function AddTrackerDialog({
  kit,
  onClose,
}: {
  kit: InventoryKitDetail;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [beaconId, setBeaconId] = useState('');

  const attach = useMutation({
    // A conflict is a decision for the user, not something to re-send.
    retry: false,
    mutationFn: () => apiV1StockItemsPartialUpdate(kit.id, buildTrackerPatch(beaconId)),
    onSuccess: () => {
      // The kit now has a tracker, so this action card disappears and the Live
      // Location panel takes its place. One prefix rearranges the screen.
      void queryClient.invalidateQueries({ queryKey: stockItemKeys.all });
      onClose();
    },
  });

  const canSubmit = canSubmitBeacon(beaconId) && !attach.isPending;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    // Guarded rather than relying on the disabled button: a blank value is a
    // *silent* server-side no-op, so Enter must not be able to reach it either.
    if (!canSubmit) return;
    attach.mutate();
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Hansel Tracker</DialogTitle>
          <DialogDescription>
            Enter the beacon ID printed on the tracker to enable real-time location for this kit.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <KitSummary kit={kit} />

          <Field
            label="Hansel Tracker"
            required
            htmlFor="beacon-id"
            error={attach.error ? trackerErrorMessage(attach.error) : undefined}
          >
            <Input
              id="beacon-id"
              // The beacon vocabulary is documented nowhere in the contract and
              // mobile imposes no pattern, so neither does this: a format
              // invented here would reject ids the hardware really issues.
              value={beaconId}
              autoFocus
              disabled={attach.isPending}
              placeholder="Beacon ID"
              onChange={(event) => {
                setBeaconId(event.target.value);
                // Drop the conflict on the first edit so it never outlives the
                // value that caused it.
                attach.reset();
              }}
            />
          </Field>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={attach.isPending}
              onClick={onClose}
              className="sm:flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit} className="sm:flex-1">
              {attach.isPending ? (
                <span
                  className="size-5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
                  role="status"
                  aria-label="Adding tracker"
                />
              ) : (
                'Add Tracker'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
