import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightIcon, CalendarIcon, CameraIcon, ImagePlusIcon, XIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { createInventoryTransfer } from '@/api/generated/endpoints/inventory/inventory';
import type { InventoryKitDetail, ReasonEnum, TransportMethodEnum } from '@/api/generated/model';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatCalendarDate } from '@/lib/dates';
import { cn } from '@/lib/utils';

import { stockItemKeys } from '../inventory.keys';
import { EMPTY } from '../kit-detail';
import { statusLabels } from '../stock-status';
import { transferQueries } from '../transfer.queries';
import {
  buildTransferBody,
  findTarget,
  fromDateInput,
  hasTransferErrors,
  REASON_OPTIONS,
  replaceFile,
  requiresLabelPhoto,
  seedTransferForm,
  targetKey,
  toDateInput,
  toTargets,
  transferErrorMessage,
  transferFieldErrors,
  transportLabel,
  TRANSPORT_OPTIONS,
  validateTransferForm,
  withCurrentAssignment,
  currentAssignment,
  type StagedFile,
  type Target,
} from '../transfer';

import { ExpiredBanner, Field, KitSummary } from './dialog-parts';

/**
 * Send a kit somewhere else.
 *
 * Mounted only while open (see `kit-actions.tsx`), for the reasons
 * `update-status-dialog.tsx` records: the edit session and the component
 * lifetime become the same thing, so every field seeds from the kit for free
 * and closing discards staged changes without a confirmation, the way mobile
 * does.
 *
 * Simpler than Update Status in one structural way — this is a single atomic
 * POST, so there is no ordering to keep, no partial-success state and no
 * "already written" latch. A failure leaves the kit exactly as it was.
 *
 * The rules are the mobile app's. The desktop prototype restricts an expired
 * kit to "Warehouse only" with the reason locked to Return; that was decided
 * against — mobile has no such rule and the backend has no Warehouse — so the
 * expired banner here restricts nothing.
 */
export function TransferDialog({ kit, onClose }: { kit: InventoryKitDetail; onClose: () => void }) {
  const queryClient = useQueryClient();

  const [values, setValues] = useState(() => seedTransferForm(kit));
  const [showErrors, setShowErrors] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  const targetsQuery = useQuery(transferQueries.targets());
  const targets = withCurrentAssignment(
    toTargets(targetsQuery.data?.results ?? []),
    currentAssignment(kit),
  );

  /*
   * Object URLs are created in the file inputs' change handlers — never in a
   * state initialiser or an effect, both of which StrictMode double-fires —
   * revoked when a photo is replaced or cleared, and swept here on unmount.
   * The ref is what makes the sweep safe: at the unmount React simulates right
   * after the first mount, neither photo is staged, so nothing is revoked.
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
    // One request; react-query's retry would re-POST and create a second
    // transfer for the same kit, which the server would then reject as already
    // in transit — a confusing error for a retry nobody asked for.
    retry: false,
    mutationFn: () => createInventoryTransfer(buildTransferBody(kit, values, targets)),
    onSuccess: () => {
      // The kit is now in transit: its detail row, its history feed and its
      // on-hand row are all stale, and one prefix covers all three.
      void queryClient.invalidateQueries({ queryKey: stockItemKeys.all });
      onClose();
    },
  });

  const clientErrors = validateTransferForm(values);
  // The server wins the slot: its message is about the value it actually saw.
  const errors = { ...clientErrors, ...transferFieldErrors(create.error) };

  const disabled = create.isPending;
  const from = findTarget(targets, values.fromKey);
  const to = findTarget(targets, values.toKey);
  const needsLabel = requiresLabelPhoto(values.transport);

  function patch(next: Partial<typeof values>) {
    setValues((current) => ({ ...current, ...next }));
  }

  function handleTransport(method: TransportMethodEnum) {
    setValues((current) => {
      // Switching to a method that wants no label photo drops the staged one:
      // `buildTransferBody` would omit it anyway, but leaving it in state means
      // the tile stays on screen for a method that never asks for it.
      if (requiresLabelPhoto(method) || !current.labelPhoto) {
        return { ...current, transport: method };
      }
      URL.revokeObjectURL(current.labelPhoto.previewUrl);
      return { ...current, transport: method, labelPhoto: null };
    });
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
    if (hasTransferErrors(clientErrors)) return;
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
          <DialogTitle>Transfer Kit</DialogTitle>
          <DialogDescription className="sr-only">
            Move this kit to another representative or facility.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-5 py-5">
          <KitSummary kit={kit} />

          <ExpiredBanner
            kit={kit}
            detail={`Exp: ${formatCalendarDate(kit.expiration_date) ?? EMPTY}. Returning it to the manufacturer is usually the right move.`}
          />

          {from || to ? (
            <div className="flex items-center gap-3 rounded-lg border border-success bg-success-container px-4 py-3">
              <RouteEnd label="From" value={from?.name} />
              <ArrowRightIcon aria-hidden className="size-5 shrink-0 text-success" />
              <RouteEnd label="To" value={to?.name} />
            </div>
          ) : null}

          <Field
            label="Transfer From"
            required
            htmlFor="transfer-from"
            error={showErrors ? errors.from : undefined}
          >
            <TargetSelect
              id="transfer-from"
              value={values.fromKey}
              targets={targets}
              disabled={disabled}
              loading={targetsQuery.isPending}
              onChange={(key) => patch({ fromKey: key })}
            />
          </Field>

          <Field
            label="Transfer To"
            required
            htmlFor="transfer-to"
            error={showErrors ? errors.to : undefined}
          >
            <TargetSelect
              id="transfer-to"
              value={values.toKey}
              targets={targets}
              disabled={disabled}
              loading={targetsQuery.isPending}
              placeholder="Select destination..."
              onChange={(key) => patch({ toKey: key })}
            />
            {targetsQuery.isError ? (
              <p className="mt-1 text-xs text-muted-foreground">Could not load destinations.</p>
            ) : null}
          </Field>

          <Field
            label="Reason"
            required
            htmlFor="transfer-reason"
            error={showErrors ? errors.reason : undefined}
          >
            <Select
              value={values.reason}
              disabled={disabled}
              onValueChange={(value) => patch({ reason: value as ReasonEnum })}
            >
              <SelectTrigger id="transfer-reason" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASON_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Transfer Date"
            required
            error={showErrors ? errors.transferDate : undefined}
          >
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled}
                  className="w-full justify-between font-normal"
                >
                  {formatCalendarDate(values.transferDate) ?? 'Select a date'}
                  <CalendarIcon aria-hidden className="size-4 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={fromDateInput(values.transferDate)}
                  defaultMonth={fromDateInput(values.transferDate)}
                  onSelect={(date) => {
                    // No bounds: back-dating a hand-off that happened yesterday
                    // and scheduling tomorrow's are both real, and mobile
                    // allows either.
                    if (date) patch({ transferDate: toDateInput(date) });
                    setDateOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>
          </Field>

          <Field
            label="Transport Method"
            required
            htmlFor="transfer-transport"
            error={showErrors ? errors.transport : undefined}
          >
            <Select
              value={values.transport ?? ''}
              disabled={disabled}
              onValueChange={(value) => handleTransport(value as TransportMethodEnum)}
            >
              <SelectTrigger id="transfer-transport" className="w-full">
                <SelectValue placeholder="Select how it's being transported..." />
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

          <div>
            <Label className="mb-2">Current Status</Label>
            <div className="flex flex-wrap gap-1.5">
              {statusLabels(kit).map((label) => (
                <Badge key={label} variant="secondary">
                  {label}
                </Badge>
              ))}
            </div>
          </div>

          <Field label="Required Photos" required error={showErrors ? errors.photos : undefined}>
            {values.transport === null ? (
              <div className="flex items-center justify-center gap-2 rounded-lg bg-muted px-4 py-4 text-sm text-muted-foreground">
                <CameraIcon aria-hidden className="size-4" />
                Select a transport method to see required photos
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-2.5">
                  <PhotoCapture
                    name="kit-photo"
                    title="Kit Photo"
                    subtitle={needsLabel ? 'Before boxing' : 'Before hand-off'}
                    staged={values.kitPhoto}
                    disabled={disabled}
                    onPick={(file) => handleFile('kitPhoto', file)}
                  />
                  {needsLabel ? (
                    <PhotoCapture
                      name="label-photo"
                      title="Shipping Label"
                      subtitle={`${transportLabel(values.transport)} tracking label`}
                      staged={values.labelPhoto}
                      disabled={disabled}
                      onPick={(file) => handleFile('labelPhoto', file)}
                    />
                  ) : null}
                </div>
                {needsLabel ? null : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Shipping label not required — rep is hand-carrying.
                  </p>
                )}
              </>
            )}
          </Field>

          <Field label="Notes" hint="(optional)" htmlFor="transfer-notes">
            <Textarea
              id="transfer-notes"
              value={values.notes}
              disabled={disabled}
              placeholder="Surgery details, special instructions..."
              onChange={(event) => patch({ notes: event.target.value })}
            />
          </Field>
        </div>

        <div className="border-t px-5 py-4">
          {create.error ? (
            <p role="alert" className="mb-2 text-sm text-destructive">
              {transferErrorMessage(create.error)}
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
                aria-label="Transferring"
              />
            ) : (
              'Confirm Transfer'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RouteEnd({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="min-w-0 flex-1 text-center">
      <p className="text-[11px] font-bold tracking-wide text-success uppercase">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{value || EMPTY}</p>
    </div>
  );
}

function TargetSelect({
  id,
  value,
  targets,
  disabled,
  loading,
  placeholder = 'Select...',
  onChange,
}: {
  id: string;
  value: string | null;
  targets: readonly Target[];
  disabled: boolean;
  loading: boolean;
  placeholder?: string;
  onChange: (key: string) => void;
}) {
  return (
    <Select value={value ?? ''} disabled={disabled || loading} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={loading ? 'Loading…' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {targets.map((target) => (
          // Keyed by `type:id`, never the bare id: a representative and a
          // facility can share one, and the wrong pick would be saved rather
          // than rejected.
          <SelectItem key={targetKey(target)} value={targetKey(target)}>
            {target.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * One replaceable file.
 *
 * A label wrapping an `sr-only` input rather than a button that clicks a hidden
 * one, for the reason `update-status-dialog.tsx` records: the affordance the
 * user touches *is* the control, so it gets keyboard activation and an
 * accessible name for free.
 */
function PhotoCapture({
  name,
  title,
  subtitle,
  staged,
  disabled,
  onPick,
}: {
  name: string;
  title: string;
  subtitle: string;
  staged: StagedFile | null;
  disabled: boolean;
  onPick: (file: File | null) => void;
}) {
  return (
    <div className="relative">
      <label
        className={cn(
          'flex h-32 w-40 cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border-2 border-dashed px-2 text-center',
          'focus-within:ring-2 focus-within:ring-ring',
          'has-disabled:pointer-events-none has-disabled:opacity-55',
          staged
            ? 'border-solid border-success bg-success-container'
            : 'border-primary bg-brand-container',
        )}
      >
        {staged ? (
          <img src={staged.previewUrl} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <>
            <ImagePlusIcon aria-hidden className="size-5 text-primary" />
            <span className="text-xs font-semibold text-foreground">{title}</span>
            <span className="text-[11px] text-muted-foreground">{subtitle}</span>
          </>
        )}
        <input
          type="file"
          accept="image/*"
          aria-label={staged ? `Replace ${title}` : `Add ${title}`}
          data-testid={name}
          className="sr-only"
          disabled={disabled}
          onChange={(event) => {
            onPick(event.target.files?.[0] ?? null);
            // Without this, picking the same file twice in a row fires no
            // change event.
            event.target.value = '';
          }}
        />
      </label>
      {staged ? (
        <button
          type="button"
          aria-label={`Remove ${title}`}
          disabled={disabled}
          onClick={() => onPick(null)}
          className="absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none"
        >
          <XIcon aria-hidden className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
