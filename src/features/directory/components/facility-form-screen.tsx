import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarIcon, XIcon } from 'lucide-react';
import { useState } from 'react';

import type { AccreditationStatusEnum, FacilityDetail } from '@/api/generated/model';
import { FacilityTypeEnum } from '@/api/generated/model';
import { Field } from '@/components/field';
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
import { transferKeys } from '@/features/inventory/inventory.keys';
import { formatCalendarDate, fromDateInput, toDateInput } from '@/lib/dates';

import type { CompanyField } from '../company-form';
import { facilityKeys } from '../directory.keys';
import {
  MAX_LENGTHS,
  MAX_NAME_LENGTH,
  facilityFieldErrors,
  facilitySaveErrorMessage,
  hasFacilityErrors,
  initialFacilityValues,
  seedFacilityValues,
  validateFacility,
  type FacilityDateField,
  type FacilityErrors,
  type FacilityTextField,
  type FacilityValues,
} from '../facility-form';
import {
  ACCREDITATION_STATUSES,
  ACCREDITATION_STATUS_LABELS,
  FACILITY_TYPES,
  FACILITY_TYPE_LABELS,
} from '../facility-labels';
import {
  initialFacilitySaveState,
  isFacilityHalfSaved,
  isFacilitySaveComplete,
  madeFacilityProgress,
  runFacilitySave,
} from '../facility.save';

/**
 * Add a facility, or amend one.
 *
 * One component for create and edit, the split `ProductFormScreen` and
 * `ManufacturerFormScreen` make: they differ in a heading and a request, and
 * two near-identical twenty-three-field forms is how the required markers on
 * one of them go stale.
 *
 * ## A save is two requests
 *
 * Thirteen fields belong to the facility role and go in one request — unlike a
 * manufacturer, whose PATCH accepts only `name`. (The endpoint takes fifteen;
 * `is_active` and `onboarding_status` are deliberately not on this form, and
 * `facility-form.ts` says why for each.) The ten contact and billing fields
 * belong to the shared `Company` identity behind it, written through
 * `/directory/companies/{id}/` — a separate resource on purpose, because one
 * `Company` may be pointed at by this organization's manufacturer and tenant
 * rows too. For a hospital that is also a supplier that is an ordinary case,
 * not an exotic one.
 *
 * So the interesting case is not failure, it is **half-failure**: the facility
 * is created or amended and the contacts are not. `record` is what makes that
 * recoverable. It starts as the facility being amended (`null` when creating)
 * and is **replaced by the server's answer after each request that lands**, so
 * `facilitySavePlan` recomputed on the next submit no longer contains the step
 * that already succeeded. Without it, pressing Save again after a half-failed
 * create would file a second facility under a name the server has now taken —
 * and would be refused, with the real problem still unfixed.
 *
 * ## The order, and why the boundary is marked twice
 *
 * Name and type, then the three contact groups, then the facility's own
 * affiliations, identifiers, licensing and notes. Who to call is what someone
 * filling this in usually has to hand; a GPO member ID is looked up
 * deliberately.
 *
 * That puts the `Company` half in the *middle* of the form, so the point where
 * the subject changes has to be marked at both ends — a single divider before
 * the contact groups would leave everything after them reading as more of the
 * organization's details. The two lines are cheap and they are also what makes
 * the half-save message below make sense when it fires.
 *
 * ## Why the contact half is not collapsed behind a disclosure
 *
 * Twenty-three fields obviously want folding up, and it is a trap. The most
 * common failure on this form is a 400 on `contact_email`; a field error
 * rendered inside a collapsed section is invisible, and the user then does the
 * one thing that must not happen — refills the form and resubmits. If this is
 * ever collapsed it must auto-expand whenever a company field carries an error
 * or the save is half-done.
 *
 * Presentational apart from its own mutation: navigation lives in the route
 * files, which is why `onCancel` is handed the record — after a half-failed
 * create there is a row to go back to that did not exist when the form opened.
 */
export function FacilityFormScreen({
  facility,
  onCancel,
  onSaved,
}: {
  /** The facility being amended, or null to add a new one. */
  facility: FacilityDetail | null;
  /** Handed whatever row now exists — null only if nothing was ever created. */
  onCancel: (record: FacilityDetail | null) => void;
  onSaved: (saved: FacilityDetail) => void;
}) {
  const queryClient = useQueryClient();

  // The record as the server last answered it: the prop while editing, null
  // while creating, and whatever a landed write returned after that. Every
  // attempt diffs against this, which is what keeps a retry from re-sending the
  // half that already succeeded.
  const [record, setRecord] = useState<FacilityDetail | null>(facility);
  const [values, setValues] = useState<FacilityValues>(() =>
    facility ? seedFacilityValues(facility) : initialFacilityValues(),
  );
  const [submitted, setSubmitted] = useState(false);

  const save = useMutation({
    // `runFacilitySave` never rejects — a partial success is neither an error
    // nor a success — so react-query's own retry has nothing to act on, and
    // leaving it on would file a second facility under the same name.
    retry: false,
    mutationFn: async () => {
      const before = initialFacilitySaveState(values, record);
      return { before, after: await runFacilitySave(before) };
    },
    onSuccess: async ({ before, after }) => {
      setRecord(after.saved);

      // On any real change, not just a complete one: once the role write
      // lands, this table and the Transfer dialog's destination picker are
      // stale whether or not the company write followed.
      if (madeFacilityProgress(before, after)) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: facilityKeys.all }),
          queryClient.invalidateQueries({ queryKey: transferKeys.targets() }),
        ]);
      }

      if (isFacilitySaveComplete(after) && after.saved) onSaved(after.saved);
    },
  });

  const attempt = save.data?.after ?? null;
  const saveError = attempt?.error ?? save.error ?? null;
  const halfSaved = attempt !== null && isFacilityHalfSaved(attempt);

  const clientErrors = validateFacility(values);
  // The server wins the slot: its message is about the value it actually saw,
  // and the name's uniqueness rule is only answerable there.
  const serverErrors = facilityFieldErrors(saveError);
  const shown: FacilityErrors = submitted ? { ...clientErrors, ...serverErrors } : serverErrors;

  const disabled = save.isPending;

  function update<K extends keyof FacilityValues>(field: K, value: FacilityValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (hasFacilityErrors(clientErrors)) return;
    // Nothing to send is not a failed save: leave as though it had succeeded,
    // rather than making the user cancel out of a form they did not change.
    const planned = initialFacilitySaveState(values, record);
    if (record && isFacilitySaveComplete(planned)) {
      onSaved(record);
      return;
    }
    save.mutate();
  }

  /**
   * A plain text input.
   *
   * The parameter is the free-text fields only, not `keyof FacilityValues` —
   * so `text('facility_type', …)` is a type error rather than a `<Select>`
   * silently rendered as a text box. It is also what lets the value and the
   * change handler be typed rather than cast.
   */
  const text = (field: FacilityTextField | CompanyField, label: string, maxLength?: number) => (
    <Field label={label} htmlFor={`facility-${field}`} error={shown[field]}>
      <Input
        id={`facility-${field}`}
        value={values[field]}
        maxLength={maxLength}
        disabled={disabled}
        onChange={(event) => update(field, event.target.value)}
      />
    </Field>
  );

  const date = (field: FacilityDateField, label: string) => (
    <DateField
      label={label}
      id={`facility-${field}`}
      value={values[field]}
      disabled={disabled}
      error={shown[field]}
      onChange={(next) => update(field, next)}
    />
  );

  return (
    <form onSubmit={submit} noValidate className="max-w-3xl">
      <div className="space-y-6 rounded-lg border border-gray-200 bg-white p-6">
        <Group legend="Facility">
          <Field label="Name" required htmlFor="facility-name" error={shown.name}>
            <Input
              id="facility-name"
              value={values.name}
              maxLength={MAX_NAME_LENGTH}
              autoFocus
              disabled={disabled}
              onChange={(event) => update('name', event.target.value)}
            />
          </Field>
          <Field label="Facility type" htmlFor="facility-facility_type">
            <Select
              value={values.facility_type}
              disabled={disabled}
              onValueChange={(next) => update('facility_type', next as FacilityTypeEnum)}
            >
              <SelectTrigger id="facility-facility_type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FACILITY_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {FACILITY_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </Group>

        <div className="border-t pt-5">
          <p className="text-sm text-muted-foreground">
            The fields below belong to the organization behind this facility and are saved
            separately, so any other role it plays shows the same ones.
          </p>
        </div>

        {/*
          Labels are qualified rather than left short inside their group. A
          `<legend>` groups the controls visually and for a screen reader
          browsing the form, but it does not make the *label* unique — and
          three controls called "Name" over three called "Email" is ambiguous
          the moment anyone reaches one out of order. Naming them after the
          wire fields has a second payoff: matching a 400's field key to the
          control it belongs to needs no translation.
        */}
        <Group legend="Organization contact">
          {text('phone', 'Phone', 20)}
          {text('fax', 'Fax', 20)}
          {text('email', 'Email', 254)}
        </Group>

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
          The other half of the boundary above. With the contact block in the
          middle of the form rather than at the end, one divider is not enough:
          without this line the affiliation and licensing groups read as more
          of the organization's details, which they are not — they are the
          facility's own, and they go in the other request.
        */}
        <div className="border-t pt-5">
          <p className="text-sm text-muted-foreground">
            The rest is recorded against this facility itself.
          </p>
        </div>

        <Group legend="Affiliations">
          {text('gpo_affiliation', 'GPO affiliation', MAX_LENGTHS.gpo_affiliation ?? undefined)}
          {text('gpo_member_id', 'GPO member ID', MAX_LENGTHS.gpo_member_id ?? undefined)}
          {text('idn_affiliation', 'IDN affiliation', MAX_LENGTHS.idn_affiliation ?? undefined)}
        </Group>

        <Group legend="Identifiers">
          {text('npi_number', 'NPI number', MAX_LENGTHS.npi_number ?? undefined)}
          {text('tax_id', 'Tax ID / EIN', MAX_LENGTHS.tax_id ?? undefined)}
          {text('dea_number', 'DEA number', MAX_LENGTHS.dea_number ?? undefined)}
        </Group>

        <Group legend="Licensing and accreditation">
          {text(
            'state_license_number',
            'State licence number',
            MAX_LENGTHS.state_license_number ?? undefined,
          )}
          {date('state_license_expiration', 'Licence expires')}
          <Field label="Accreditation status" htmlFor="facility-accreditation_status">
            <Select
              // Radix cannot hold `''` as an item value, so the "not recorded"
              // option carries a sentinel and is mapped at both edges. `''` is
              // a legal value on the wire — the contract declares this field
              // `oneOf: [AccreditationStatusEnum, BlankEnum]` — so it has to
              // stay reachable, not merely be the initial state.
              value={values.accreditation_status || NOT_RECORDED}
              disabled={disabled}
              onValueChange={(next) =>
                update(
                  'accreditation_status',
                  next === NOT_RECORDED ? '' : (next as AccreditationStatusEnum),
                )
              }
            >
              <SelectTrigger id="facility-accreditation_status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NOT_RECORDED}>Not recorded</SelectItem>
                {ACCREDITATION_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {ACCREDITATION_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {date('accreditation_expiration', 'Accreditation expires')}
        </Group>

        <Group legend="Notes" className="grid grid-cols-1 gap-4">
          <Field
            label="Internal notes"
            hint=" (not visible to the facility)"
            htmlFor="facility-notes"
            error={shown.notes}
          >
            <Textarea
              id="facility-notes"
              value={values.notes}
              rows={4}
              disabled={disabled}
              onChange={(event) => update('notes', event.target.value)}
            />
          </Field>
        </Group>

        {/*
          Where the subject changes, said at the point it changes. The edit
          route's page intro says the same thing, but it has scrolled off by
          the time anyone reaches these fields — and this is also what makes
          the half-save message below make sense when it fires.
        */}
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
            {attempt?.saved ? `“${attempt.saved.name}” was saved` : 'The facility was saved'}, but
            its contact details were not.
            {hasFacilityErrors(serverErrors)
              ? ' Correct the fields below and try again.'
              : ` ${facilitySaveErrorMessage(saveError)}`}
          </p>
        ) : saveError && !hasFacilityErrors(serverErrors) ? (
          <p role="alert" className="text-sm text-destructive">
            {facilitySaveErrorMessage(saveError)}
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
              'Add facility'
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}

/** The sentinel the accreditation `Select` uses for `''`. */
const NOT_RECORDED = '__not_recorded__';

/**
 * A nullable date, with a way back to nothing.
 *
 * The Calendar-in-a-Popover shape is `receive-sku-form.tsx`'s, with one
 * addition that matters here: **Clear**. Both of these dates are amendable and
 * nullable, so a licence expiry typed by mistake has to be removable — and
 * `facilitySavePlan` turns an empty box into `null` rather than `''`, which is
 * what the server accepts as a clear. The receive form's picker has no Clear
 * because an expiration entered there is part of a receipt, not a correctable
 * profile field.
 *
 * Local rather than promoted to `src/components/`: two callers, both in this
 * file. `receive-sku-form.tsx` would be the third, and moving it there is a
 * tidy follow-up rather than part of this change — its picker carries a
 * load-bearing "no lower bound, stock that arrives already expired is exactly
 * what an audit needs recorded" note that has to survive the move.
 */
function DateField({
  label,
  id,
  value,
  disabled,
  error,
  onChange,
}: {
  label: string;
  id: string;
  /** `''` for no date, otherwise `YYYY-MM-DD`. */
  value: string;
  disabled?: boolean;
  error?: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Field label={label} htmlFor={id} error={error}>
      <div className="flex gap-1">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id={id}
              type="button"
              variant="outline"
              disabled={disabled}
              /*
                An explicit name, because `<button>` is a labelable element:
                the `<label for>` `Field` renders would otherwise *be* the
                accessible name and the chosen date would never be announced —
                the control would read as "Licence expires, button" whether it
                held a date or not. `aria-label` wins over the label element
                while the `for` association still focuses this on a label
                click, so both affordances survive.
              */
              aria-label={`${label}, ${formatCalendarDate(value) ?? 'no date selected'}`}
              className="w-full justify-between font-normal"
            >
              {formatCalendarDate(value) ?? 'Select a date'}
              <CalendarIcon aria-hidden className="size-4 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={fromDateInput(value)}
              defaultMonth={fromDateInput(value)}
              onSelect={(next) => {
                // No bounds either way: a licence that expired last year is
                // exactly the thing an operator needs recorded, not refused.
                if (next) onChange(toDateInput(next));
                setOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Clear ${label.toLowerCase()}`}
            disabled={disabled}
            onClick={() => onChange('')}
          >
            <XIcon />
          </Button>
        ) : null}
      </div>
    </Field>
  );
}

/**
 * One labelled group of controls.
 *
 * A real `<fieldset>`/`<legend>`, not a heading and a `<div>`: twenty-five
 * inputs across eight groups is exactly the case where a screen reader needs to
 * know that "Email" means the billing one. Three of the labels repeat across
 * groups, so without this they are genuinely ambiguous.
 *
 * A sibling of the identically-shaped helper in `manufacturer-form-screen.tsx`
 * rather than a promotion of it. Nine lines of markup shared between two files
 * in one feature is not yet worth a component in `src/components/` — and the
 * `Group` in `manufacturer-detail-screen.tsx` is a *different* thing despite
 * the name (a `<section>`/`<h3>`/`<dl>`), so a promotion would immediately
 * invite merging two DOM shapes behind one flag. Revisit on the third caller.
 */
function Group({
  legend,
  className,
  children,
}: {
  legend: string;
  /** For the odd group that wants one column — Notes is a full-width textarea. */
  className?: string;
  children: React.ReactNode;
}) {
  return (
    // `@container` on the fieldset, the grid query on the child: a container
    // query reads its *ancestor*, so both on one element would size the grid
    // against something else entirely. Same shape as `ProductDetailScreen`.
    <fieldset className="@container min-w-0">
      <legend className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {legend}
      </legend>
      <div className={className ?? 'grid grid-cols-1 gap-4 @sm:grid-cols-2'}>{children}</div>
    </fieldset>
  );
}
