import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, TriangleAlertIcon, Undo2Icon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { createInventoryTransfer } from '@/api/generated/endpoints/inventory/inventory';
import type { InventoryKitDetail, TransportMethodEnum } from '@/api/generated/model';
import { Field } from '@/components/field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatCalendarDate } from '@/lib/dates';
import { cn } from '@/lib/utils';

import { stockItemKeys } from '../inventory.keys';
import { EMPTY } from '../kit-detail';
import {
  buildReturnBody,
  hasReturnErrors,
  returnErrorMessage,
  returnFieldErrors,
  seedReturnForm,
  validateReturnForm,
} from '../return-to-manufacturer';
import { replaceFile, TRANSPORT_OPTIONS } from '../transfer';

import { ExpiredBanner, KitSummary, PhotoCapture } from './dialog-parts';

/**
 * Send a kit back to the manufacturer.
 *
 * A return is an inventory transfer with `reason: 'return'` and no in-system
 * destination — see `return-to-manufacturer.ts` for why that is the whole
 * definition. Like Transfer it is one atomic POST, so there is no ordering, no
 * partial-success state and no latch; a failure leaves the kit untouched.
 *
 * The kit does not leave inventory here. It goes *in transit*, and only
 * `confirm_inventory_transfer_receipt` — which this app does not have yet —
 * soft-deletes it. Same gap Transfer ships with.
 *
 * Mounted only while open (see `kit-actions.tsx`), which makes the edit session
 * and the component lifetime the same thing.
 */
export function ReturnToManufacturerDialog({
  kit,
  onClose,
}: {
  kit: InventoryKitDetail;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const [values, setValues] = useState(() => seedReturnForm(kit));
  const [showErrors, setShowErrors] = useState(false);

  /*
   * Object URLs are created in the file inputs' change handlers — never in a
   * state initialiser or an effect, both of which StrictMode double-fires —
   * revoked on replace, and swept here on unmount.
   */
  const valuesRef = useRef(values);
  useEffect(() => {
    valuesRef.current = values;
  });
  useEffect(
    () => () => {
      for (const staged of [valuesRef.current.kitPhoto, valuesRef.current.labelPhoto]) {
        if (staged) URL.revokeObjectURL(staged.previewUrl);
      }
    },
    [],
  );

  const create = useMutation({
    // One request. A retry would create a second return for the same kit, which
    // the server then rejects as already in transit.
    retry: false,
    mutationFn: () => createInventoryTransfer(buildReturnBody(kit, values)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: stockItemKeys.all });
      onClose();
    },
  });

  const clientErrors = validateReturnForm(values);
  // The server wins the slot: its message is about the value it actually saw.
  const errors = { ...clientErrors, ...returnFieldErrors(create.error) };
  const disabled = create.isPending;

  function patch(next: Partial<typeof values>) {
    setValues((current) => ({ ...current, ...next }));
  }

  function handleFile(slot: 'kitPhoto' | 'labelPhoto', file: File | null) {
    setValues((current) => {
      const next = file ? { file, previewUrl: URL.createObjectURL(file) } : null;
      const { value, revoke } = replaceFile(current[slot], next);
      if (revoke) URL.revokeObjectURL(revoke);
      return { ...current, [slot]: value };
    });
  }

  function handleSave() {
    setShowErrors(true);
    if (hasReturnErrors(clientErrors)) return;
    create.mutate();
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-4rem)] gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>Return to Manufacturer</DialogTitle>
          <DialogDescription className="sr-only">
            Send this kit back to its manufacturer, recording why and in what condition.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-5 py-5">
          <KitSummary kit={kit} />

          {/*
            Read-only, not a disabled control: the manufacturer is a property of
            the kit, and choosing one is not a thing this screen offers.
          */}
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
            <span
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-container text-primary"
            >
              <Undo2Icon className="size-4.5" />
            </span>
            <p className="text-sm text-muted-foreground">
              Sending back to{' '}
              <span className="font-semibold text-foreground">{kit.manufacturer_name}</span>
            </p>
          </div>

          <ExpiredBanner
            kit={kit}
            detail={`Exp: ${formatCalendarDate(kit.expiration_date) ?? EMPTY}. Returning it is the recommended way to resolve this.`}
          />

          <Field
            label="Reason"
            required
            htmlFor="return-reason"
            error={showErrors ? errors.returnReason : undefined}
          >
            <Input
              id="return-reason"
              value={values.returnReason}
              disabled={disabled}
              placeholder="e.g., Damaged, Expired, Overstocked"
              onChange={(event) => patch({ returnReason: event.target.value })}
            />
          </Field>

          <Field label="Kit Condition" required>
            <ToggleGroup
              type="single"
              variant="outline"
              value={values.isComplete ? 'complete' : 'incomplete'}
              disabled={disabled}
              // Radix emits '' when the pressed item is clicked again. Ignoring
              // it is what keeps "exactly one is always selected" true — stored,
              // it would silently empty a required field.
              onValueChange={(next) => {
                if (next) patch({ isComplete: next === 'complete' });
              }}
              className="w-full"
            >
              <ConditionItem value="complete" label="Complete" icon={CheckIcon} />
              <ConditionItem
                value="incomplete"
                label="Incomplete"
                icon={TriangleAlertIcon}
                iconClassName="text-warning"
              />
            </ToggleGroup>
          </Field>

          <Field
            label="Transport Method"
            required
            htmlFor="return-transport"
            error={showErrors ? errors.transport : undefined}
          >
            <Select
              value={values.transport ?? ''}
              disabled={disabled}
              onValueChange={(value) => patch({ transport: value as TransportMethodEnum })}
            >
              <SelectTrigger id="return-transport" className="w-full">
                <SelectValue placeholder="Select how it's being shipped..." />
              </SelectTrigger>
              <SelectContent>
                {TRANSPORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/*
            Both, always — a return always ships to the manufacturer. Transfer's
            carrier-only rule for the label does not apply, and
            `requiresLabelPhoto` is deliberately not imported here.
          */}
          <Field label="Required Photos" required error={showErrors ? errors.photos : undefined}>
            <div className="flex flex-wrap gap-2.5">
              <PhotoCapture
                name="kit-photo"
                title="Kit Photo"
                subtitle="Before boxing"
                staged={values.kitPhoto}
                disabled={disabled}
                onPick={(file) => handleFile('kitPhoto', file)}
              />
              <PhotoCapture
                name="label-photo"
                title="Shipping Label"
                subtitle="For tracking"
                staged={values.labelPhoto}
                disabled={disabled}
                onPick={(file) => handleFile('labelPhoto', file)}
              />
            </div>
          </Field>

          <Field label="Notes" hint="(optional)" htmlFor="return-notes">
            <Textarea
              id="return-notes"
              value={values.notes}
              disabled={disabled}
              placeholder="Any additional details..."
              onChange={(event) => patch({ notes: event.target.value })}
            />
          </Field>
        </div>

        <div className="border-t px-5 py-4">
          {create.error ? (
            <p role="alert" className="mb-2 text-sm text-destructive">
              {returnErrorMessage(create.error)}
            </p>
          ) : null}
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={disabled}
            onClick={handleSave}
          >
            {create.isPending ? (
              <span
                className="size-5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
                role="status"
                aria-label="Returning"
              />
            ) : (
              'Confirm Return'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One pole of the condition pair.
 *
 * Tinted to match the Update Status selected chip rather than shadcn's default
 * `outline` pressed state, so the same semantic control does not read as two
 * different things across two dialogs.
 */
function ConditionItem({
  value,
  label,
  icon: Icon,
  iconClassName,
}: {
  value: string;
  label: string;
  icon: typeof CheckIcon;
  iconClassName?: string;
}) {
  return (
    <ToggleGroupItem
      value={value}
      aria-label={label}
      className={cn(
        'h-auto flex-1 flex-col gap-1 py-3.5 text-xs font-medium',
        'data-[state=on]:border-success data-[state=on]:bg-success-container',
      )}
    >
      <Icon aria-hidden className={cn('size-4.5', iconClassName)} />
      {label}
    </ToggleGroupItem>
  );
}
