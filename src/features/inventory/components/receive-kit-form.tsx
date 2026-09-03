import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { CheckIcon, ImagePlusIcon, TriangleAlertIcon, XIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Field } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { facetQueries } from '../on-hand.queries';
import {
  beaconConflictMessage,
  buildCreateBody,
  hasErrors,
  initialValues,
  locationOptions,
  MAX_KIT_ID_LENGTH,
  MAX_PHOTOS,
  OWNERSHIP_TYPES,
  receiveFieldErrors,
  saveErrorMessage,
  validateReceiveKit,
  type ReceiveKitErrors,
  type ReceiveKitValues,
  type StagedPhoto,
} from '../receive-kit';
import {
  initialReceiveSaveState,
  isReceiveSaveComplete,
  isRetryingPhotos,
  runReceiveSave,
  type ReceiveSaveState,
} from '../receive.save';
import { catalogQueries } from '../receive.queries';
import { transferQueries } from '../transfer.queries';

/**
 * Register a physical kit into inventory.
 *
 * The Kit + Manual half of Receive / Load. Field rules, the payload and the
 * error mapping live in `receive-kit.ts`; the create-then-upload sequence and
 * its latch live in `receive.save.ts`. What is left here is the form.
 */
export function ReceiveKitForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [values, setValues] = useState<ReceiveKitValues>(initialValues);
  const [photos, setPhotos] = useState<StagedPhoto[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [saveState, setSaveState] = useState<ReceiveSaveState | null>(null);
  /** The 409, which belongs under the tracker field rather than in the alert. */
  const [beaconError, setBeaconError] = useState<string | null>(null);

  const manufacturers = useQuery(catalogQueries.manufacturers());
  const parts = useQuery(catalogQueries.parts(values.manufacturerId));
  const targets = useQuery(transferQueries.targets());
  const facets = useQuery(facetQueries.physicalLocations());

  const representatives = (targets.data?.results ?? []).filter(
    (target) => target.type === 'representative',
  );
  const locations = locationOptions(facets.data?.results);

  const errors = validateReceiveKit(values, photos);
  const serverErrors = saveState?.error ? receiveFieldErrors(saveState.error) : {};
  const shown: ReceiveKitErrors = submitted ? { ...errors, ...serverErrors } : serverErrors;

  const retryingPhotos = isRetryingPhotos(saveState);

  /*
   * Object URLs are created in the file input's change handler — never in a
   * state initialiser or an effect, both of which StrictMode double-fires —
   * revoked when a tile is dropped, and swept here on unmount. The ref is
   * synced in an effect rather than during render, which the linter forbids and
   * which would be wrong anyway; the sweep is safe on StrictMode's simulated
   * unmount because the list is empty until the user picks a file.
   */
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

  const save = useMutation({
    // `runReceiveSave` never rejects — a partial success is neither an error nor
    // a success — so react-query's own retry has nothing to act on, and leaving
    // it on would multiply requests against a shared 100/min bucket.
    retry: false,
    mutationFn: (state: ReceiveSaveState) => runReceiveSave(state),
    onSuccess: async (next) => {
      setSaveState(next);
      setBeaconError(beaconConflictMessage(next.error));

      if (!isReceiveSaveComplete(next)) return;

      // One prefix, which also refreshes the facet menus the new kit may have
      // just added a location to. The catalog is keyed separately and rightly
      // stays put.
      await queryClient.invalidateQueries({ queryKey: stockItemKeys.all });
      await navigate({ to: '/inventory/on-hand' });
    },
  });

  const disabled = save.isPending;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);

    // Once the kit exists the form's values are no longer in play — a retry
    // re-sends outstanding photos only — so re-validating them would block a
    // retry on fields the user can no longer affect.
    if (!retryingPhotos && hasErrors(errors)) return;

    setBeaconError(null);
    save.mutate(saveState ?? initialReceiveSaveState(buildCreateBody(values), photos));
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
    // Without this, picking the same file twice in a row fires no change event.
    event.target.value = '';
  }

  function removePhoto(key: string) {
    setPhotos((current) => {
      const going = current.find((photo) => photo.key === key);
      if (going) URL.revokeObjectURL(going.previewUrl);
      return current.filter((photo) => photo.key !== key);
    });
  }

  function update<K extends keyof ReceiveKitValues>(field: K, value: ReceiveKitValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {retryingPhotos ? (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg bg-warning-container p-3 text-sm text-warning-foreground"
        >
          <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          This kit is already saved. Edits to the fields above won’t be applied — only its photos
          are still uploading.
        </p>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Manufacturer" required htmlFor="manufacturer" error={shown.manufacturer}>
          {/*
            `''` rather than `undefined` for "nothing chosen", here and in every
            select below. Radix reads `undefined` as "uncontrolled" and keeps
            displaying whatever was last picked, so clearing Kit Name below
            would leave the old kit on screen while the state said null — the
            precise failure this dependency exists to prevent.
          */}
          <Select
            value={values.manufacturerId === null ? '' : String(values.manufacturerId)}
            disabled={disabled || manufacturers.isPending}
            onValueChange={(next) => {
              // A kit belongs to one manufacturer, and the server derives the
              // stock's manufacturer from the part — so a selection left over
              // from the previous choice would file the kit under a
              // manufacturer the user did not pick, and nothing would reject
              // it.
              setValues((current) => ({
                ...current,
                manufacturerId: Number(next),
                partId: null,
              }));
            }}
          >
            <SelectTrigger id="manufacturer" className="w-full">
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
          <LoadFailure query={manufacturers} noun="manufacturers" />
        </Field>

        <Field
          label="Rep / Assigned To"
          required
          htmlFor="representative"
          error={shown.representative}
        >
          <Select
            value={values.representativeId === null ? '' : String(values.representativeId)}
            disabled={disabled || targets.isPending}
            onValueChange={(next) => update('representativeId', Number(next))}
          >
            <SelectTrigger id="representative" className="w-full">
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
          <LoadFailure query={targets} noun="representatives" />
        </Field>

        <Field label="Physical Location" required htmlFor="location" error={shown.location}>
          <Select
            value={values.physicalLocation}
            disabled={disabled}
            onValueChange={(next) => update('physicalLocation', next)}
          >
            <SelectTrigger id="location" className="w-full">
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

        <Field
          label="Kit Name"
          required
          hint=" — From SurgiSync catalog"
          htmlFor="part"
          error={shown.part}
        >
          <Select
            value={values.partId === null ? '' : String(values.partId)}
            disabled={disabled || values.manufacturerId === null || parts.isPending}
            onValueChange={(next) => update('partId', Number(next))}
          >
            <SelectTrigger id="part" className="w-full">
              <SelectValue
                placeholder={
                  values.manufacturerId === null ? 'Select a manufacturer first' : 'Select kit...'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {(parts.data ?? []).map((part) => (
                <SelectItem key={part.id} value={String(part.id)}>
                  {part.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/*
            A real state, not a defensive branch. The manufacturer list is the
            global catalog while this one is scoped to the organization, so a
            valid manufacturer can genuinely have no kits this org may receive.
          */}
          {values.manufacturerId !== null && parts.isSuccess && parts.data.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              This manufacturer has no kits you can receive.
            </p>
          ) : null}
          <LoadFailure query={parts} noun="kits" />
        </Field>

        <Field label="Kit ID" required htmlFor="kit-id" error={shown.kitId}>
          <Input
            id="kit-id"
            value={values.kitId}
            disabled={disabled}
            maxLength={MAX_KIT_ID_LENGTH}
            placeholder="Enter Kit ID"
            onChange={(event) => update('kitId', event.target.value)}
          />
        </Field>

        <Field
          label="Hansel Tracker"
          hint=" (optional)"
          htmlFor="beacon-id"
          error={beaconError ?? shown.beacon}
        >
          <Input
            id="beacon-id"
            value={values.beaconId}
            disabled={disabled}
            placeholder="Beacon ID"
            onChange={(event) => {
              update('beaconId', event.target.value);
              // The conflict is about the value that caused it, so it must not
              // outlive the first edit to that value.
              setBeaconError(null);
            }}
          />
        </Field>

        <Field label="Type" required htmlFor="ownership-type">
          <Select
            value={values.ownershipType}
            disabled={disabled}
            onValueChange={(next) =>
              update('ownershipType', next as ReceiveKitValues['ownershipType'])
            }
          >
            <SelectTrigger id="ownership-type" className="w-full">
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
      </div>

      <Field label="Status" required>
        {/*
          A binary, not Update Status's eight-flag checklist: mobile holds one
          `isComplete` bool. Radios rather than the toggle chips there, because
          exactly one of the two is always true — the prototype lets you
          deselect both, which would leave a required field empty and is a
          mockup artefact rather than a rule.
        */}
        <div role="radiogroup" aria-label="Status" className="grid max-w-md grid-cols-2 gap-2">
          <StatusChoice
            label="Complete"
            selected={values.isComplete}
            disabled={disabled}
            onSelect={() => update('isComplete', true)}
          />
          <StatusChoice
            label="Incomplete"
            selected={!values.isComplete}
            disabled={disabled}
            onSelect={() => update('isComplete', false)}
          />
        </div>
      </Field>

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

          {/*
            A label wrapping the input rather than a button that clicks a hidden
            one: the affordance the user touches *is* the control, so it gets
            keyboard activation and an accessible name for free. Left enabled
            past the maximum on purpose — the count is validated, not prevented,
            and one rule stated twice drifts.
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
              multiple
              aria-label="Add photo"
              className="sr-only"
              disabled={disabled}
              onChange={handleFiles}
            />
          </label>
        </div>
      </Field>

      <Field label="Notes" hint=" (optional)" htmlFor="notes" error={shown.notes}>
        <Textarea
          id="notes"
          value={values.notes}
          disabled={disabled}
          placeholder="Additional details..."
          onChange={(event) => update('notes', event.target.value)}
        />
      </Field>

      {save.isSuccess && saveState?.error && !beaconError ? (
        <p role="alert" className="text-sm text-destructive">
          {saveErrorMessage(saveState.error)}
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
          'Save Kit'
        )}
      </Button>
    </form>
  );
}

/**
 * A one-line note under a select whose options could not be loaded.
 *
 * Without it, a failed query and an organization with no values render the same
 * empty list, and the user is told nothing either way.
 */
function LoadFailure({ query, noun }: { query: { isError: boolean }; noun: string }) {
  if (!query.isError) return null;
  return <p className="mt-1 text-xs text-muted-foreground">Could not load {noun}.</p>;
}

function StatusChoice({
  label,
  selected,
  disabled,
  onSelect,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'relative flex items-center justify-center gap-1.5 rounded-lg border-2 px-2 py-3 text-sm font-medium transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        'disabled:pointer-events-none disabled:opacity-55',
        selected
          ? 'border-success bg-success-container font-bold text-success-foreground'
          : 'border-border bg-card text-foreground hover:border-primary',
      )}
    >
      {selected ? <CheckIcon aria-hidden className="size-4" /> : null}
      {label}
    </button>
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
        // Positional, because the server treats the oldest photo as primary and
        // offers no way to nominate another.
        <span className="absolute inset-x-0 bottom-0 bg-foreground/70 py-0.5 text-center text-[10px] font-semibold text-background">
          Primary
        </span>
      ) : null}
    </div>
  );
}
