import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { Address } from '@/api/generated/model';
import { AddressKindEnum } from '@/api/generated/model';
import { Field } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import {
  ADDRESS_KINDS,
  ADDRESS_KIND_LABELS,
  MAX_CITY_LENGTH,
  MAX_CONTACT_NAME_LENGTH,
  MAX_COUNTRY_LENGTH,
  MAX_LABEL_LENGTH,
  MAX_LINE_LENGTH,
  MAX_PHONE_LENGTH,
  MAX_STATE_LENGTH,
  MAX_ZIP_LENGTH,
  addressFieldErrors,
  addressSaveErrorMessage,
  hasAddressErrors,
  initialAddressValues,
  isUnchanged,
  seedAddressValues,
  validateAddress,
  type AddressErrors,
  type AddressValues,
} from '../address-form';

/**
 * Add an address to an organization's book, or amend one.
 *
 * One component for both, because they are the same twelve controls over the
 * same rules and differ only in which request they send and what the form is
 * seeded from — the split `NameDialog` makes.
 *
 * A `Dialog` rather than a page, unlike the manufacturer record itself: this is
 * a sub-collection on a detail screen, which is where this app puts dialogs
 * (`AddComponentDialog`, `ComponentQuantityDialog`). Eleven of the twelve
 * controls are one-line inputs.
 *
 * Mounted only while open, so a draft cannot outlive a close and every open
 * reseeds from the row.
 */
export function AddressDialog({
  address,
  addresses,
  onSave,
  invalidates,
  onClose,
}: {
  /** The address being amended, or null to add one. */
  address: Address | null;
  /** The whole book, so the primary hint can name the address it would replace. */
  addresses: readonly Address[];
  onSave: (values: AddressValues, address: Address | null) => Promise<unknown>;
  invalidates: readonly (readonly unknown[])[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<AddressValues>(() =>
    address ? seedAddressValues(address) : initialAddressValues(),
  );
  const [submitted, setSubmitted] = useState(false);

  const save = useMutation({
    // One request. A retried POST files a second address, and unlike a kit
    // there is nothing on it for the user to notice the duplicate by.
    retry: false,
    mutationFn: () => onSave(values, address),
    onSuccess: async () => {
      await Promise.all(invalidates.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      onClose();
    },
  });

  const isNew = address === null;
  const clientErrors = validateAddress(values, { isNew });
  const serverErrors = addressFieldErrors(save.error);
  const shown: AddressErrors = submitted ? { ...clientErrors, ...serverErrors } : serverErrors;
  const disabled = save.isPending;

  const kindLabel = ADDRESS_KIND_LABELS[values.kind];
  /*
    Read off the *selected* kind, not the row's original one. The server uses
    the effective (kind, is_primary) pair, so moving a primary shipping address
    to billing while still primary stands down the primary **billing** address —
    naming the incumbent of the old kind would point at the wrong row.
  */
  const incumbent = addresses.find(
    (row) =>
      row.is_primary &&
      (row.kind ?? AddressKindEnum.physical) === values.kind &&
      row.id !== address?.id,
  );

  function update<K extends keyof AddressValues>(field: K, value: AddressValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (hasAddressErrors(clientErrors)) return;
    // Nothing to send is not a failed save.
    if (address && isUnchanged(values, address)) {
      onClose();
      return;
    }
    save.mutate();
  }

  const text = (
    field: keyof AddressErrors,
    label: string,
    maxLength: number,
    options: { required?: boolean; hint?: string; className?: string } = {},
  ) => (
    <Field
      label={label}
      required={options.required}
      hint={options.hint}
      htmlFor={`address-${field}`}
      error={shown[field]}
    >
      <Input
        id={`address-${field}`}
        value={values[field]}
        maxLength={maxLength}
        disabled={disabled}
        className={options.className}
        onChange={(event) => update(field, event.target.value)}
      />
    </Field>
  );

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        // A request in flight is not cancellable, so neither Escape nor the
        // overlay may close the dialog out from under it.
        if (!next && !disabled) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{isNew ? 'Add address' : 'Edit address'}</DialogTitle>
            <DialogDescription>
              This address book belongs to the organization behind the manufacturer, so any other
              role it plays reads the same one.
            </DialogDescription>
          </DialogHeader>

          <div className="grid max-h-[60vh] grid-cols-1 gap-4 overflow-y-auto py-4 sm:grid-cols-2">
            <Field label="Kind" htmlFor="address-kind">
              <Select
                value={values.kind}
                disabled={disabled}
                onValueChange={(next) => update('kind', next as AddressKindEnum)}
              >
                <SelectTrigger id="address-kind" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADDRESS_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {ADDRESS_KIND_LABELS[kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {text('label', 'Label', MAX_LABEL_LENGTH, { hint: ' e.g. Main Campus' })}

            {/*
              Required when adding, and not when amending. Every column on
              `Address` is blankable server-side — migration 0131 backfilled
              partial rows and a stricter API would have left them unpatchable —
              so refusing to save a row that *arrived* without a street would be
              the very unpatchability the backend avoided. Adding a blank one
              from a web form is still a mistake rather than a use case.
            */}
            {text('address_line_1', 'Address line 1', MAX_LINE_LENGTH, { required: isNew })}
            {text('address_line_2', 'Address line 2', MAX_LINE_LENGTH)}
            {text('city', 'City', MAX_CITY_LENGTH, { required: isNew })}
            {text('state', 'State', MAX_STATE_LENGTH)}
            {text('zip_code', 'ZIP code', MAX_ZIP_LENGTH)}
            {/*
              A two-letter box, not a picker. The contract publishes no enum for
              this — only `maxLength: 2` — so a hand-written list of 250 would
              be a second source of truth for something the server does not
              constrain, for a field that is US on essentially every row.
            */}
            {text('country', 'Country', MAX_COUNTRY_LENGTH, {
              hint: ' two-letter code',
              className: 'uppercase',
            })}

            {text('contact_name', 'Contact', MAX_CONTACT_NAME_LENGTH)}
            {text('phone', 'Phone', MAX_PHONE_LENGTH)}

            <Field label="Delivery instructions" htmlFor="address-instructions">
              <Textarea
                id="address-instructions"
                value={values.instructions}
                disabled={disabled}
                rows={3}
                onChange={(event) => update('instructions', event.target.value)}
              />
            </Field>

            <div className="sm:col-span-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="address-is-primary"
                  checked={values.is_primary}
                  disabled={disabled}
                  onCheckedChange={(checked) => update('is_primary', checked === true)}
                />
                <Label htmlFor="address-is-primary" className="font-normal">
                  Primary {kindLabel.toLowerCase()} address
                </Label>
              </div>
              {/*
                The consequence, said out loud. Promotion is a transition rather
                than a flag: at most one address per organization per kind may be
                primary, so the server stands the incumbent down in the same
                transaction. Nothing else in the UI would tell you that happened.
              */}
              <p className="mt-1.5 text-xs text-muted-foreground">
                {values.is_primary && incumbent
                  ? `Replaces ${incumbent.label?.trim() || incumbent.address_line_1?.trim() || 'the current primary'}, which stops being the primary ${kindLabel.toLowerCase()} address.`
                  : `At most one ${kindLabel.toLowerCase()} address is primary. Choosing this one stands down whichever holds it now.`}
              </p>
            </div>
          </div>

          {save.error && !hasAddressErrors(serverErrors) ? (
            <p role="alert" className="mb-2 text-sm text-destructive">
              {addressSaveErrorMessage(save.error)}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={disabled}>
              Cancel
            </Button>
            <Button type="submit" disabled={disabled}>
              {disabled ? (
                <span
                  className="size-5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
                  role="status"
                  aria-label="Saving"
                />
              ) : isNew ? (
                'Add address'
              ) : (
                'Save'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
