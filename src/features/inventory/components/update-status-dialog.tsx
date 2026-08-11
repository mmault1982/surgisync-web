import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BanIcon, ImagePlusIcon, ImageOffIcon, TriangleAlertIcon, XIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { InventoryKitDetail } from '@/api/generated/model';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import { stockItemKeys } from '../inventory.keys';
import { EMPTY, ownershipLabel } from '../kit-detail';
import { facetQueries } from '../on-hand.queries';
import { isExpired } from '../stock-status';
import {
  addFiles,
  buildStatusPatch,
  hasFormErrors,
  isChipSelected,
  MAX_PHOTOS,
  photoCount,
  planPhotoOps,
  removeTile,
  saveErrorMessage,
  seedFlags,
  seedStrip,
  stagedUrls,
  statusFieldErrors,
  STATUS_CHIPS,
  STATUS_LEGEND,
  toggleChip,
  validateStatusForm,
  withCurrentLocation,
  type Chip,
  type PhotoTile,
} from '../update-status';
import { initialSaveState, isSaveComplete, madeProgress, runSave } from '../update-status.save';

/**
 * Change a kit's status, location, photos and notes.
 *
 * Mounted only while open (see `kit-actions.tsx`), which is what makes the
 * edit session and the component's lifetime the same thing: every `useState`
 * below seeds from the kit for free, closing by any route discards the staged
 * changes without a confirmation the way mobile does, and the "already
 * PATCHed" latch in `saveState` cannot outlive the session it belongs to. The
 * cost is the exit animation, which never plays.
 *
 * The rules here are the mobile app's, not the desktop prototype's. The
 * prototype disables chips for sterile-packed and expired kits and has Lost
 * clear everything; both were explicitly decided against, so the expired
 * banner below restricts nothing and no chip is ever disabled by another.
 */
export function UpdateStatusDialog({
  kit,
  onClose,
}: {
  kit: InventoryKitDetail;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const [flags, setFlags] = useState(() => seedFlags(kit));
  const [location, setLocation] = useState(() => kit.physical_location ?? '');
  const [notes, setNotes] = useState(() => kit.notes ?? '');
  const [strip, setStrip] = useState(() => seedStrip(kit));
  const [showErrors, setShowErrors] = useState(false);
  const [saveState, setSaveState] = useState<ReturnType<typeof initialSaveState> | null>(null);

  const facets = useQuery(facetQueries.physicalLocations());
  const locations = withCurrentLocation(facets.data?.results ?? [], kit.physical_location);

  /*
   * Object URLs are created in the file input's change handler — never in a
   * state initialiser or an effect, both of which StrictMode double-fires —
   * revoked when a tile is dropped, and swept here on unmount. The ref is what
   * makes the sweep safe: at the unmount React simulates immediately after the
   * first mount, the strip holds only server photos, so nothing is revoked.
   */
  const stripRef = useRef(strip);
  useEffect(() => {
    stripRef.current = strip;
  });
  useEffect(
    () => () => {
      for (const url of stagedUrls(stripRef.current)) URL.revokeObjectURL(url);
    },
    [],
  );

  const values = { flags, location, notes };
  const clientErrors = validateStatusForm(values, strip);
  // The server wins the slot: its message is about the value it actually saw.
  const errors = { ...clientErrors, ...statusFieldErrors(saveState?.error) };

  const save = useMutation({
    // `runSave` never rejects — a partial success is neither an error nor a
    // success — so react-query's own retry has nothing to act on, and leaving
    // it on would multiply requests against a shared 100/min bucket.
    retry: false,
    mutationFn: async () => {
      const before =
        saveState ?? initialSaveState(buildStatusPatch(kit, values), planPhotoOps(strip));
      return { before, after: await runSave(kit.id, before) };
    },
    onSuccess: ({ before, after }) => {
      // On any real change, not just a complete one: once the PATCH lands, the
      // cached kit, the history feed and the on-hand row are stale whether or
      // not the photos followed.
      if (madeProgress(before, after)) {
        void queryClient.invalidateQueries({ queryKey: stockItemKeys.all });
      }
      if (isSaveComplete(after)) {
        onClose();
        return;
      }
      setSaveState(after);
    },
  });

  /*
   * Once the status write has landed and photo work is outstanding, the form
   * is read-only. Otherwise a chip edited before pressing Retry would never be
   * sent — the latch skips the PATCH — and the user would watch a change they
   * made silently vanish. Giving up is still safe: the PATCH is saved, and
   * reopening reseeds from the refetched kit with only the photos left to do.
   */
  const locked =
    saveState !== null && saveState.pendingPatch === null && !isSaveComplete(saveState);
  const disabled = locked || save.isPending;

  function handleSave() {
    setShowErrors(true);
    if (hasFormErrors(clientErrors)) return;
    save.mutate();
  }

  function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    setStrip((current) =>
      addFiles(
        current,
        picked.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
      ),
    );
    // Without this, picking the same file twice in a row fires no change event.
    event.target.value = '';
  }

  function handleRemove(key: string) {
    const { next, revoke } = removeTile(strip, key);
    setStrip(next);
    if (revoke) URL.revokeObjectURL(revoke);
  }

  const count = photoCount(strip);
  const ownership = ownershipLabel(kit);
  const outstanding = saveState?.pendingOps.length ?? 0;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-4rem)] gap-0 p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>Update Status</DialogTitle>
          <DialogDescription className="sr-only">
            Change this kit’s status flags, physical location, photos and notes.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-5 py-5">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{kit.part_name}</p>
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                {kit.manufacturer_kit_id ?? EMPTY}
              </p>
            </div>
            {ownership ? <Badge variant="secondary">{ownership}</Badge> : null}
          </div>

          {isExpired(kit) ? (
            // Informational only. Mark the condition, then use Return to
            // Manufacturer — nothing in this dialog is restricted by it.
            <div className="flex items-start gap-3 rounded-lg border-l-4 border-l-destructive bg-brand-container px-4 py-3.5">
              <BanIcon aria-hidden className="size-5 shrink-0 text-destructive" />
              <div>
                <p className="text-sm font-bold text-destructive">Expired — kit cannot be used</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Exp: {kit.expiration_date}. Mark condition for return audit, then Return to
                  Manufacturer.
                </p>
              </div>
            </div>
          ) : null}

          <Field
            label="Status"
            required
            hint="(select all that apply)"
            error={showErrors ? errors.status : undefined}
          >
            <div className="grid grid-cols-4 gap-2">
              {STATUS_CHIPS.map((chip) => (
                <StatusChip
                  key={chip.key}
                  chip={chip}
                  selected={isChipSelected(chip, flags)}
                  disabled={disabled}
                  onClick={() => setFlags((current) => toggleChip(current, chip))}
                />
              ))}
            </div>
            <ul className="mt-3 space-y-0.5 text-xs text-muted-foreground">
              {STATUS_LEGEND.map((line) => (
                <li key={line}>• {line}</li>
              ))}
            </ul>
          </Field>

          <Field
            label="Physical Location"
            required
            htmlFor="physical-location"
            error={showErrors ? errors.location : undefined}
          >
            <Select value={location} onValueChange={setLocation} disabled={disabled}>
              <SelectTrigger id="physical-location" className="w-full">
                <SelectValue placeholder="Select where it’s stored..." />
              </SelectTrigger>
              <SelectContent>
                {locations.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {facets.isError ? (
              <p className="mt-1 text-xs text-muted-foreground">Could not load locations.</p>
            ) : null}
          </Field>

          <Field
            label="Photos"
            required
            hint={`(${count} of ${MAX_PHOTOS})`}
            hintTone={count > MAX_PHOTOS ? 'text-destructive' : undefined}
            error={showErrors ? errors.photos : undefined}
          >
            <div className="flex flex-wrap gap-2.5">
              {strip.tiles.map((tile, index) => (
                <PhotoSlot
                  key={tile.key}
                  tile={tile}
                  primary={index === 0}
                  failed={saveState?.failedOps.includes(tile.key) ?? false}
                  disabled={disabled}
                  onRemove={() => handleRemove(tile.key)}
                />
              ))}

              {/*
                A label wrapping the input, not a button that clicks one: this
                way the affordance the user touches *is* the control, so it
                gets keyboard activation and an accessible name for free. Left
                enabled past the maximum on purpose — the count is validated,
                not prevented, and one rule stated twice drifts.
              */}
              <label
                className={cn(
                  'flex size-24 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-primary bg-brand-container text-primary',
                  'focus-within:ring-2 focus-within:ring-ring',
                  'has-disabled:pointer-events-none has-disabled:opacity-55',
                )}
              >
                <ImagePlusIcon aria-hidden className="size-5" />
                <span className="mt-1 text-[11px] font-medium">Add</span>
                <input
                  type="file"
                  accept="image/*"
                  aria-label="Add photo"
                  className="sr-only"
                  disabled={disabled}
                  onChange={handleFiles}
                />
              </label>
            </div>
          </Field>

          <Field
            label="Notes"
            required={flags.is_lost || flags.is_other}
            hint={flags.is_lost || flags.is_other ? undefined : '(optional)'}
            htmlFor="status-notes"
            error={showErrors ? errors.notes : undefined}
          >
            <Textarea
              id="status-notes"
              value={notes}
              disabled={disabled}
              placeholder="Any additional details..."
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
        </div>

        <div className="border-t px-5 py-4">
          {save.data && !isSaveComplete(save.data.after) && outstanding > 0 ? (
            // A failed *upload* marks its own tile; a failed deletion has no
            // tile left to mark, so the count is where it shows up.
            <p className="mb-2 text-xs text-muted-foreground">
              {outstanding} photo change{outstanding === 1 ? '' : 's'} still to apply.
            </p>
          ) : null}
          {saveState?.error ? (
            <p role="alert" className="mb-2 text-sm text-destructive">
              {saveErrorMessage(saveState.error)}
            </p>
          ) : null}
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={save.isPending}
            onClick={handleSave}
          >
            {save.isPending ? (
              <span
                className="size-5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
                role="status"
                aria-label="Saving"
              />
            ) : locked ? (
              'Retry'
            ) : (
              'Save Status'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  hint,
  hintTone,
  htmlFor,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  hintTone?: string;
  htmlFor?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor} className="mb-2">
        {label}
        {required ? <span className="text-destructive">*</span> : null}
        {hint ? (
          <span className={cn('font-normal text-muted-foreground', hintTone)}>{hint}</span>
        ) : null}
      </Label>
      {children}
      {error ? <p className="mt-1 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function StatusChip({
  chip,
  selected,
  disabled,
  onClick,
}: {
  chip: Chip;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'relative flex flex-col items-center gap-1 rounded-lg border-2 px-2 py-3.5 text-xs font-medium transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        'disabled:pointer-events-none disabled:opacity-55',
        selected
          ? // No brand-red hover here, unlike the prototype: it repaints the
            // border a selected chip uses to say it *is* selected, so pointing
            // at one reads as unselecting it. Same reason the sidebar keeps its
            // brand tint on hover rather than the prototype's grey.
            'border-success bg-success-container font-bold text-success-foreground'
          : 'border-border bg-card text-foreground hover:border-primary',
      )}
    >
      <chip.icon aria-hidden className={cn('size-4.5', !selected && chip.iconClassName)} />
      {chip.label}
      {selected ? (
        <span aria-hidden className="absolute top-1 right-1.5 text-[11px] font-bold">
          ✓
        </span>
      ) : null}
    </button>
  );
}

function PhotoSlot({
  tile,
  primary,
  failed,
  disabled,
  onRemove,
}: {
  tile: PhotoTile;
  primary: boolean;
  failed: boolean;
  disabled: boolean;
  onRemove: () => void;
}) {
  const src = tile.kind === 'staged' ? tile.previewUrl : tile.url;

  return (
    <div
      className={cn(
        'relative size-24 overflow-hidden rounded-lg border bg-muted',
        failed && 'ring-2 ring-destructive',
      )}
    >
      {src ? (
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        // `url` is nullable on the API, so a photo the server has not finished
        // processing still gets a tile rather than a broken image.
        <span className="flex size-full items-center justify-center text-muted-foreground">
          <ImageOffIcon aria-hidden className="size-5" />
        </span>
      )}

      {failed ? (
        <span className="absolute inset-x-0 top-0 flex items-center gap-1 bg-destructive/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          <TriangleAlertIcon aria-hidden className="size-3" />
          Upload failed
        </span>
      ) : null}

      <Button
        type="button"
        variant="secondary"
        size="icon-xs"
        disabled={disabled}
        onClick={onRemove}
        className="absolute top-1 right-1 rounded-full"
      >
        <XIcon />
        <span className="sr-only">Remove photo</span>
      </Button>

      {primary ? (
        // Positional, because the server treats the oldest photo as primary and
        // offers no way to nominate another. There is no control here for the
        // same reason.
        <span className="absolute inset-x-0 bottom-0 bg-foreground/70 py-0.5 text-center text-[10px] font-semibold text-background">
          Primary
        </span>
      ) : null}
    </div>
  );
}
