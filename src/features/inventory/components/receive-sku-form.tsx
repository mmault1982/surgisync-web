import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarIcon, ImagePlusIcon, TriangleAlertIcon, XIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { PartList } from '@/api/generated/model';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatCalendarDate, fromDateInput, toDateInput } from '@/lib/dates';
import { cn } from '@/lib/utils';

import { stockItemKeys } from '../inventory.keys';
import { facetQueries } from '../on-hand.queries';
import { locationOptions, MAX_PHOTOS, OWNERSHIP_TYPES, type StagedPhoto } from '../receive-kit';
import { catalogQueries, lookupByReference } from '../receive.queries';
import {
  initialReceiveSaveState,
  isReceiveSaveComplete,
  isRetryingPhotos,
  runReceiveSave,
  type ReceiveSaveState,
} from '../receive.save';
import {
  buildSkuCreateBody,
  hasSkuErrors,
  initialSkuValues,
  isQuantityLocked,
  MAX_LOT_CODE_LENGTH,
  MAX_UDI_LENGTH,
  partLabel,
  resetSkuItem,
  resolveCatalogNumber,
  skuFieldErrors,
  skuSaveErrorMessage,
  validateReceiveSku,
  type ReceiveSkuErrors,
  type ReceiveSkuValues,
} from '../receive-sku';
import { transferQueries } from '../transfer.queries';

import { Field } from './dialog-parts';

/**
 * Register a loose catalog item into inventory.
 *
 * The SKU + Manual half of Receive / Load. Three things make it not just the
 * Kit form with different fields: the part is *found* by typing a catalog
 * number rather than picked from a list, it carries a quantity the part itself
 * may forbid, and a save leaves the form ready for the next item rather than
 * leaving the screen.
 */
export function ReceiveSkuForm() {
  const queryClient = useQueryClient();

  const [values, setValues] = useState<ReceiveSkuValues>(initialSkuValues);
  const [photos, setPhotos] = useState<StagedPhoto[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [saveState, setSaveState] = useState<ReceiveSaveState | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  /** The catalog item the current number resolved to, and why it did not. */
  const [part, setPart] = useState<PartList | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const manufacturers = useQuery(catalogQueries.manufacturers());
  const targets = useQuery(transferQueries.targets());
  const facets = useQuery(facetQueries.physicalLocations());

  const representatives = (targets.data?.results ?? []).filter(
    (target) => target.type === 'representative',
  );
  const locations = locationOptions(facets.data?.results);

  const errors = validateReceiveSku(values, part, photos, catalogError);
  const serverErrors = saveState?.error ? skuFieldErrors(saveState.error) : {};
  const shown: ReceiveSkuErrors = submitted ? { ...errors, ...serverErrors } : serverErrors;

  const retryingPhotos = isRetryingPhotos(saveState);
  const quantityLocked = isQuantityLocked(part);

  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  });
  useEffect(
    () => () => {
      for (const photo of photosRef.current) URL.revokeObjectURL(photo.previewUrl);
    },
    [],
  );

  /**
   * Resolve the typed catalog number.
   *
   * Idempotent and safe to fire repeatedly — on blur, on Enter, and again at
   * submit — because any edit to the field clears the resolution, so a number
   * that is already resolved short-circuits.
   */
  const lookup = useMutation({
    retry: false,
    mutationFn: (reference: string) => lookupByReference(reference),
    onSuccess: (page, reference) => {
      // A slow response for a number the user has since typed over must not
      // describe the field's current contents.
      if (reference !== values.catalogNumber.trim()) return;
      const resolution = resolveCatalogNumber(page.results, values.manufacturerId);
      setPart(resolution.part);
      setCatalogError(resolution.error);
    },
    onError: () => setCatalogError('Could not look up that number. Try again.'),
  });

  async function resolveNow(): Promise<PartList | null> {
    const reference = values.catalogNumber.trim();
    if (!reference) return null;
    if (part) return part;
    const page = await lookup.mutateAsync(reference).catch(() => null);
    if (!page) return null;
    return resolveCatalogNumber(page.results, values.manufacturerId).part;
  }

  const save = useMutation({
    retry: false,
    mutationFn: (state: ReceiveSaveState) => runReceiveSave(state),
    onSuccess: async (next) => {
      setSaveState(next);
      if (!isReceiveSaveComplete(next)) return;

      await queryClient.invalidateQueries({ queryKey: stockItemKeys.all });

      // Ready for the next item rather than gone: SKU mode is for loading a
      // delivery one line at a time, so the session selections stay and only
      // the per-item fields clear. There is no toast in this app, so the form
      // has to say a save happened — an emptied form otherwise looks like a
      // save that did nothing.
      for (const photo of photos) URL.revokeObjectURL(photo.previewUrl);
      setPhotos([]);
      setValues(resetSkuItem);
      setPart(null);
      setCatalogError(null);
      setSaveState(null);
      setSubmitted(false);
      setSaved(true);
    },
  });

  const disabled = save.isPending;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    setSaved(false);

    if (retryingPhotos) {
      save.mutate(saveState);
      return;
    }

    // A number typed and never blurred still needs resolving; without this the
    // first Save would fail on "look up the catalog number first" for a value
    // that is perfectly good.
    const resolved = await resolveNow();
    if (!resolved) return;
    if (hasSkuErrors(validateReceiveSku(values, resolved, photos, null))) return;

    save.mutate(initialReceiveSaveState(buildSkuCreateBody(values, resolved), photos));
  }

  function handleFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    setPhotos((current) => [
      ...current,
      ...picked.map((file) => ({
        key: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
        file,
        previewUrl: URL.createObjectURL(file),
      })),
    ]);
    event.target.value = '';
  }

  function removePhoto(key: string) {
    setPhotos((current) => {
      const going = current.find((photo) => photo.key === key);
      if (going) URL.revokeObjectURL(going.previewUrl);
      return current.filter((photo) => photo.key !== key);
    });
  }

  function update<K extends keyof ReceiveSkuValues>(field: K, value: ReceiveSkuValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setSaved(false);
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-5">
      {retryingPhotos ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg bg-warning-container p-3 text-sm text-warning-foreground"
        >
          <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          This item is already saved. Edits to the fields above won’t be applied — only its photos
          are still uploading.
        </p>
      ) : null}

      {saved ? (
        <p
          role="status"
          className="rounded-lg bg-success-container p-3 text-sm text-success-foreground"
        >
          Item saved. The manufacturer, rep, location and type are kept for the next one.
        </p>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Manufacturer" required htmlFor="sku-manufacturer" error={shown.manufacturer}>
          <Select
            value={values.manufacturerId === null ? '' : String(values.manufacturerId)}
            disabled={disabled || manufacturers.isPending}
            onValueChange={(next) => {
              const manufacturerId = Number(next);
              setValues((current) => ({ ...current, manufacturerId }));
              setSaved(false);
              // Re-judge an already-resolved item against the new choice, so
              // picking the right manufacturer clears a mismatch without
              // forcing the number to be typed again — and picking the wrong
              // one raises it without waiting for submit.
              if (lookup.data) {
                const resolution = resolveCatalogNumber(lookup.data.results, manufacturerId);
                setPart(resolution.part);
                setCatalogError(resolution.error);
              }
            }}
          >
            <SelectTrigger id="sku-manufacturer" className="w-full">
              <SelectValue placeholder="Select Manufacturer..." />
            </SelectTrigger>
            <SelectContent>
              {(manufacturers.data ?? []).map((manufacturer) => (
                <SelectItem key={manufacturer.id} value={String(manufacturer.id)}>
                  {manufacturer.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="Rep / Assigned To"
          required
          htmlFor="sku-representative"
          error={shown.representative}
        >
          <Select
            value={values.representativeId === null ? '' : String(values.representativeId)}
            disabled={disabled || targets.isPending}
            onValueChange={(next) => update('representativeId', Number(next))}
          >
            <SelectTrigger id="sku-representative" className="w-full">
              <SelectValue placeholder="Select who is accountable..." />
            </SelectTrigger>
            <SelectContent>
              {representatives.map((rep) => (
                <SelectItem key={rep.id} value={String(rep.id)}>
                  {rep.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Physical Location" required htmlFor="sku-location" error={shown.location}>
          <Select
            value={values.physicalLocation}
            disabled={disabled}
            onValueChange={(next) => update('physicalLocation', next)}
          >
            <SelectTrigger id="sku-location" className="w-full">
              <SelectValue placeholder="Select where it’s stored..." />
            </SelectTrigger>
            <SelectContent>
              {locations.map((location) => (
                <SelectItem key={location} value={location}>
                  {location}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Type" required htmlFor="sku-ownership-type">
          <Select
            value={values.ownershipType}
            disabled={disabled}
            onValueChange={(next) =>
              update('ownershipType', next as ReceiveSkuValues['ownershipType'])
            }
          >
            <SelectTrigger id="sku-ownership-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OWNERSHIP_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {/*
          `catalogError` renders immediately rather than waiting for submit,
          unlike every other slot on this form. It is the server's answer about
          the value the user has just finished typing — the same reason the Kit
          form shows a beacon conflict as soon as it arrives — and holding it
          back would let them fill the rest of the form against a part that was
          never going to be accepted.
        */}
        <Field
          label="Catalog #"
          required
          htmlFor="catalog-number"
          error={catalogError ?? shown.catalogNumber}
        >
          <Input
            id="catalog-number"
            value={values.catalogNumber}
            disabled={disabled}
            placeholder="Enter catalog #"
            onChange={(event) => {
              update('catalogNumber', event.target.value);
              // A resolved item must never outlive the number that produced it.
              setPart(null);
              setCatalogError(null);
            }}
            onBlur={() => {
              if (values.catalogNumber.trim() && !part) void resolveNow();
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              // Resolve rather than submit: the number is the thing the user
              // just finished, and submitting would race the lookup.
              event.preventDefault();
              if (values.catalogNumber.trim() && !part) void resolveNow();
            }}
          />
        </Field>

        <Field label="Description">
          <p
            aria-live="polite"
            className={cn(
              'flex min-h-9 items-center rounded-md border px-3 py-1 text-sm',
              part ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {lookup.isPending
              ? 'Looking up…'
              : part
                ? partLabel(part)
                : 'Will populate once the catalog number is found'}
          </p>
        </Field>

        <Field
          label="Quantity"
          required
          hint={quantityLocked ? ' (serialized — quantity is 1)' : undefined}
          htmlFor="quantity"
          error={shown.quantity}
        >
          <Input
            id="quantity"
            inputMode="numeric"
            value={quantityLocked ? '1' : values.quantity}
            // Pinned, not merely defaulted: a serialized part is stocked one
            // row per physical unit and the server rejects any other value.
            disabled={disabled || quantityLocked}
            onChange={(event) => update('quantity', event.target.value)}
          />
        </Field>

        <Field label="Expiration Date" hint=" (optional)" error={shown.expirationDate}>
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                className="w-full justify-between font-normal"
              >
                {formatCalendarDate(values.expirationDate) ?? 'Select a date'}
                <CalendarIcon aria-hidden className="size-4 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={fromDateInput(values.expirationDate)}
                defaultMonth={fromDateInput(values.expirationDate)}
                onSelect={(date) => {
                  // No lower bound: stock that arrives already expired is
                  // exactly what an audit needs recorded, not rejected.
                  if (date) update('expirationDate', toDateInput(date));
                  setDateOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>
        </Field>

        <Field label="UDI" hint=" (optional)" htmlFor="udi" error={shown.udi}>
          <Input
            id="udi"
            value={values.udi}
            disabled={disabled}
            maxLength={MAX_UDI_LENGTH}
            placeholder="Enter UDI"
            onChange={(event) => update('udi', event.target.value)}
          />
        </Field>

        <Field label="Lot Code" hint=" (optional)" htmlFor="lot-code" error={shown.lotCode}>
          <Input
            id="lot-code"
            value={values.lotCode}
            disabled={disabled}
            maxLength={MAX_LOT_CODE_LENGTH}
            placeholder="e.g. LOT-2024-0892"
            onChange={(event) => update('lotCode', event.target.value)}
          />
        </Field>
      </div>

      <Field
        label="Photos"
        hint={photos.length === 0 ? ' (optional)' : ` (${photos.length} of ${MAX_PHOTOS})`}
        hintTone={photos.length > MAX_PHOTOS ? 'text-destructive' : undefined}
        error={shown.photos}
      >
        <div className="flex flex-wrap gap-2.5">
          {photos.map((photo, index) => (
            <PhotoSlot
              key={photo.key}
              photo={photo}
              primary={index === 0}
              failed={saveState?.failedPhotos.includes(photo.key) ?? false}
              disabled={disabled}
              onRemove={() => removePhoto(photo.key)}
            />
          ))}

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
              multiple
              aria-label="Add photo"
              className="sr-only"
              disabled={disabled}
              onChange={handleFiles}
            />
          </label>
        </div>
      </Field>

      <Field label="Notes" hint=" (optional)" htmlFor="sku-notes" error={shown.notes}>
        <Textarea
          id="sku-notes"
          value={values.notes}
          disabled={disabled}
          placeholder="Additional details..."
          onChange={(event) => update('notes', event.target.value)}
        />
      </Field>

      {save.isSuccess && saveState?.error ? (
        <p role="alert" className="text-sm text-destructive">
          {skuSaveErrorMessage(saveState.error)}
        </p>
      ) : null}

      <Button type="submit" disabled={disabled} className="w-full">
        {disabled ? (
          <span
            className="size-5 animate-spin rounded-full border-2 border-white/40 border-t-white"
            role="status"
            aria-label="Saving"
          />
        ) : retryingPhotos ? (
          'Retry Photo Upload'
        ) : (
          'Save SKU'
        )}
      </Button>
    </form>
  );
}

function PhotoSlot({
  photo,
  primary,
  failed,
  disabled,
  onRemove,
}: {
  photo: StagedPhoto;
  primary: boolean;
  failed: boolean;
  disabled: boolean;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(
        'relative size-24 overflow-hidden rounded-lg border bg-muted',
        failed && 'ring-2 ring-destructive',
      )}
    >
      <img src={photo.previewUrl} alt="" className="size-full object-cover" />

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
        <span className="absolute inset-x-0 bottom-0 bg-foreground/70 py-0.5 text-center text-[10px] font-semibold text-background">
          Primary
        </span>
      ) : null}
    </div>
  );
}
