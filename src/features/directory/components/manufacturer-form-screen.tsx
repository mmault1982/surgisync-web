import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { ManufacturerDetail } from '@/api/generated/model';
import { Field } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { catalogKeys } from '@/features/inventory/inventory.keys';

import { manufacturerKeys } from '../directory.keys';
import {
  MAX_NAME_LENGTH,
  hasManufacturerErrors,
  initialManufacturerValues,
  manufacturerFieldErrors,
  manufacturerSaveErrorMessage,
  seedManufacturerValues,
  validateManufacturer,
  type ManufacturerErrors,
  type ManufacturerValues,
} from '../manufacturer-form';
import {
  initialManufacturerSaveState,
  isHalfSaved,
  isManufacturerSaveComplete,
  madeManufacturerProgress,
  runManufacturerSave,
} from '../manufacturer.save';

/**
 * Add a manufacturer, or amend one.
 *
 * One component for create and edit, the split `ProductFormScreen` makes: they
 * differ in a heading and a request, and two near-identical eleven-field forms
 * is how the required markers on one of them go stale.
 *
 * A page rather than a `Dialog`. `NameDialog` served this screen while a
 * manufacturer was one writable field; its own docstring says a second field is
 * where sharing it should stop, and this has eleven.
 *
 * ## A save is two requests
 *
 * `name` belongs to the manufacturer role and is the only field its PATCH
 * accepts. The ten contact and billing fields belong to the shared `Company`
 * identity behind it, written through `/directory/companies/{id}/` — a separate
 * resource on purpose, because one `Company` may be pointed at by this
 * organization's facility and tenant rows too.
 *
 * So the interesting case is not failure, it is **half-failure**: the row is
 * created or renamed and the contacts are not. `record` is what makes that
 * recoverable. It starts as the manufacturer being amended (`null` when
 * creating) and is **replaced by the server's answer after each request that
 * lands**, so `manufacturerSavePlan` recomputed on the next submit no longer
 * contains the step that already succeeded. Without it, pressing Save again
 * after a half-failed create would file a second manufacturer under the same
 * name.
 *
 * Presentational apart from its own mutation: navigation lives in the route
 * files, which is why `onCancel` is handed the record — after a half-failed
 * create there is a row to go back to that did not exist when the form opened.
 */
export function ManufacturerFormScreen({
  manufacturer,
  onCancel,
  onSaved,
}: {
  /** The manufacturer being amended, or null to add a new one. */
  manufacturer: ManufacturerDetail | null;
  /** Handed whatever row now exists — null only if nothing was ever created. */
  onCancel: (record: ManufacturerDetail | null) => void;
  onSaved: (saved: ManufacturerDetail) => void;
}) {
  const queryClient = useQueryClient();

  // The record as the server last answered it: the prop while editing, null
  // while creating, and whatever a landed write returned after that. Every
  // attempt diffs against this, which is what keeps a retry from re-sending the
  // half that already succeeded.
  const [record, setRecord] = useState<ManufacturerDetail | null>(manufacturer);
  const [values, setValues] = useState<ManufacturerValues>(() =>
    manufacturer ? seedManufacturerValues(manufacturer) : initialManufacturerValues(),
  );
  const [submitted, setSubmitted] = useState(false);

  const save = useMutation({
    // `runManufacturerSave` never rejects — a partial success is neither an
    // error nor a success — so react-query's own retry has nothing to act on,
    // and leaving it on would file a second manufacturer under the same name.
    retry: false,
    mutationFn: async () => {
      // Rebuilt from live values every attempt, against the record the server
      // last gave us. That is both the latch and the fix-and-retry path: the
      // name write drops out once it has landed, and the contact patch carries
      // whatever the user has corrected since.
      const before = initialManufacturerSaveState(values, record);
      return { before, after: await runManufacturerSave(before) };
    },
    onSuccess: async ({ before, after }) => {
      setRecord(after.saved);

      // On any real change, not just a complete one: once the role write lands,
      // this table and the Receive form's picker are stale whether or not the
      // company write followed.
      if (madeManufacturerProgress(before, after)) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: manufacturerKeys.all }),
          queryClient.invalidateQueries({ queryKey: catalogKeys.all }),
        ]);
      }

      if (isManufacturerSaveComplete(after) && after.saved) onSaved(after.saved);
    },
  });

  const attempt = save.data?.after ?? null;
  const saveError = attempt?.error ?? save.error ?? null;
  const halfSaved = attempt !== null && isHalfSaved(attempt);

  const clientErrors = validateManufacturer(values);
  // The server wins the slot: its message is about the value it actually saw,
  // and the name's uniqueness rule is only answerable there.
  const serverErrors = manufacturerFieldErrors(saveError);
  const shown: ManufacturerErrors = submitted ? { ...clientErrors, ...serverErrors } : serverErrors;

  const disabled = save.isPending;

  function update<K extends keyof ManufacturerValues>(field: K, value: ManufacturerValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (hasManufacturerErrors(clientErrors)) return;
    // Nothing to send is not a failed save: leave as though it had succeeded,
    // rather than making the user cancel out of a form they did not change.
    const planned = initialManufacturerSaveState(values, record);
    if (record && isManufacturerSaveComplete(planned)) {
      onSaved(record);
      return;
    }
    save.mutate();
  }

  const text = (field: keyof ManufacturerValues, label: string, maxLength: number) => (
    <Field label={label} htmlFor={`manufacturer-${field}`} error={shown[field]}>
      <Input
        id={`manufacturer-${field}`}
        value={values[field]}
        maxLength={maxLength}
        disabled={disabled}
        onChange={(event) => update(field, event.target.value)}
      />
    </Field>
  );

  return (
    <form onSubmit={submit} noValidate className="max-w-3xl">
      <div className="space-y-6 rounded-lg border border-gray-200 bg-white p-6">
        <Group legend="Manufacturer">
          <Field label="Name" required htmlFor="manufacturer-name" error={shown.name}>
            <Input
              id="manufacturer-name"
              value={values.name}
              maxLength={MAX_NAME_LENGTH}
              autoFocus
              disabled={disabled}
              onChange={(event) => update('name', event.target.value)}
            />
          </Field>
        </Group>

        <Group legend="Organization contact">
          {text('phone', 'Phone', 20)}
          {text('fax', 'Fax', 20)}
          {text('email', 'Email', 254)}
        </Group>

        {/*
          Labels are qualified rather than left short inside their group. A
          `<legend>` groups the controls visually and for a screen reader
          browsing the form, but it does not make the *label* unique — and
          three controls called "Name" over three called "Email" is ambiguous
          the moment anyone reaches one out of order. Naming them after the
          wire fields has a second payoff: matching a 400's field key to the
          control it belongs to needs no translation.
        */}
        <Group legend="Contact person">
          {text('contact_name', 'Contact name', 100)}
          {text('contact_title', 'Contact title', 100)}
          {text('contact_email', 'Contact email', 254)}
          {text('contact_phone', 'Contact phone', 20)}
        </Group>

        <Group legend="Billing contact">
          {text('billing_contact_name', 'Billing name', 100)}
          {text('billing_contact_email', 'Billing email', 254)}
          {text('billing_contact_phone', 'Billing phone', 20)}
        </Group>

        {/*
          Two different findings, and the first is not conditional on the
          second. "Which half landed" has to be said whether or not the failure
          also lands under a control — the common case is a 400 on
          `contact_email`, which does, and a lone field error there would read
          as "nothing happened". The obvious response to that is to fill the
          form in again and resubmit, which is the one thing that must not
          happen. The server's own message is appended only when no field
          claimed it, so it is never shown twice.
        */}
        {halfSaved ? (
          <p role="alert" className="text-sm text-destructive">
            {attempt?.saved ? `“${attempt.saved.name}” was saved` : 'The manufacturer was saved'},
            but its contact details were not.
            {hasManufacturerErrors(serverErrors)
              ? ' Correct the fields below and try again.'
              : ` ${manufacturerSaveErrorMessage(saveError)}`}
          </p>
        ) : saveError && !hasManufacturerErrors(serverErrors) ? (
          <p role="alert" className="text-sm text-destructive">
            {manufacturerSaveErrorMessage(saveError)}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onCancel(record)}
            disabled={disabled}
          >
            {/*
              After a half-failed save the row exists, so "Cancel" would be a
              lie — there is nothing left to cancel. The route sends the user to
              the record either way; only the label has to tell the truth.
            */}
            {halfSaved ? 'Leave without contact details' : 'Cancel'}
          </Button>
          <Button type="submit" disabled={disabled}>
            {disabled ? (
              <span
                className="size-5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
                role="status"
                aria-label="Saving"
              />
            ) : halfSaved ? (
              'Retry contact details'
            ) : record ? (
              'Save'
            ) : (
              'Add manufacturer'
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}

/**
 * One labelled group of controls.
 *
 * A real `<fieldset>`/`<legend>`, not a heading and a `<div>`: eleven inputs
 * across four groups is exactly the case where a screen reader needs to know
 * that "Email" means the billing one. Three of the labels repeat across groups,
 * so without this they are genuinely ambiguous.
 */
function Group({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    // `@container` on the fieldset, the grid query on the child: a container
    // query reads its *ancestor*, so both on one element would size the grid
    // against something else entirely. Same shape as `ProductDetailScreen`.
    <fieldset className="@container min-w-0">
      <legend className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {legend}
      </legend>
      <div className="grid grid-cols-1 gap-4 @sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
