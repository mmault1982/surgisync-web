import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { asFieldErrors, errorMessage } from '@/api/errors';
import { createPart, partialUpdatePart } from '@/api/generated/endpoints/inventory/inventory';
import { KindEnum, type PartDetail } from '@/api/generated/model';
import { Field } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { catalogKeys } from '@/features/inventory/inventory.keys';

import { productCatalogKeys } from '../catalog.keys';
import { partFormManufacturersQuery } from '../catalog.queries';
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_REFERENCE_NUMBER_LENGTH,
  MAX_UDI_LENGTH,
  PRODUCT_FIELD_KEYS,
  buildProductBody,
  buildProductPatch,
  hasProductErrors,
  initialProductValues,
  isUnchanged,
  productFieldErrors,
  seedProductValues,
  validateProduct,
  type ProductErrors,
  type ProductValues,
} from '../product';

/**
 * Add a product, or amend one.
 *
 * One component for create and edit. They differ in three places — the
 * heading, whether `kind` is editable, and the request — and two
 * near-identical seven-field forms is how the required markers on one of them
 * go stale.
 *
 * A page rather than a `Dialog`, unlike the Directory screens' create/edit.
 * `NameDialog`'s docstring says a second writable field is where sharing that
 * component should stop; this has seven, and the prototype's `.form-card` — a
 * two-column grid with a full-width submit — is a page layout, not a modal.
 *
 * Presentational: it takes the part and its callbacks as props, so it renders
 * without a router. Navigation lives in the route files.
 *
 * State is `useState` plus the pure validator in `product.ts`, the idiom every
 * form here but `login-form.tsx` uses — there is no shadcn `form.tsx` in this
 * project, and `Field` is the house Form primitive.
 */
export function ProductFormScreen({
  part,
  onCancel,
  onSaved,
}: {
  /** The part being amended, or null to add a new one. */
  part: PartDetail | null;
  onCancel: () => void;
  onSaved: (saved: PartDetail) => void;
}) {
  const queryClient = useQueryClient();
  const manufacturers = useQuery(partFormManufacturersQuery());

  const [values, setValues] = useState<ProductValues>(() =>
    part ? seedProductValues(part) : initialProductValues(),
  );
  const [submitted, setSubmitted] = useState(false);

  const save = useMutation({
    // One request. A retried POST files a second part under the same catalog
    // number, and the uniqueness constraint is partial — a soft-deleted
    // neighbour would not stop it.
    retry: false,
    mutationFn: () =>
      part
        ? partialUpdatePart(part.id, buildProductPatch(values, part))
        : createPart(buildProductBody(values)),
    onSuccess: async (saved) => {
      // Both roots. `catalogKeys` is the Receive form's picker cache, which
      // reads the same endpoint under a separate root with a five-minute
      // staleTime — without this, a part added here would not be receivable
      // for five minutes.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: productCatalogKeys.all }),
        queryClient.invalidateQueries({ queryKey: catalogKeys.all }),
      ]);
      onSaved(saved);
    },
  });

  const clientErrors = validateProduct(values);
  // The server wins the slot: its message is about the value it actually saw,
  // and all three uniqueness rules are only answerable there.
  const serverErrors = productFieldErrors(save.error);
  const shown: ProductErrors = submitted ? { ...clientErrors, ...serverErrors } : serverErrors;

  const disabled = save.isPending;
  const isKit = values.kind === KindEnum.kit;

  function update<K extends keyof ProductValues>(field: K, value: ProductValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (hasProductErrors(clientErrors)) return;
    // Nothing to send is not a failed save: leave as though it had succeeded,
    // rather than making the user cancel out of a form they did not change.
    if (part && isUnchanged(values, part)) {
      onSaved(part);
      return;
    }
    save.mutate();
  }

  return (
    <form onSubmit={submit} noValidate className="max-w-3xl">
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Manufacturer"
            required
            htmlFor="product-manufacturer"
            error={shown.manufacturer}
          >
            <Select
              value={values.manufacturer}
              onValueChange={(value) => update('manufacturer', value)}
              disabled={disabled || manufacturers.isPending}
            >
              <SelectTrigger id="product-manufacturer" className="w-full">
                <SelectValue
                  placeholder={manufacturers.isPending ? 'Loading…' : 'Choose a manufacturer'}
                />
              </SelectTrigger>
              <SelectContent>
                {(manufacturers.data ?? []).map((option) => (
                  <SelectItem key={option.id} value={String(option.id)}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {manufacturers.isError ? (
              <p className="mt-1 text-sm text-destructive">
                Could not load manufacturers. Reload the page to try again.
              </p>
            ) : null}
          </Field>

          <Field
            label="Kind"
            required
            htmlFor="product-kind"
            hint={part ? ' (fixed after creation)' : undefined}
            error={shown.kind}
          >
            <Select
              value={values.kind}
              onValueChange={(value) => update('kind', value as KindEnum)}
              // Read-only when amending, because the server refuses it: `kind`
              // decides which identity space the row lives in, `source_kind` is
              // stamped once at creation, and the sync service, the CSV export
              // and the orphan sweep all partition the catalog table on it.
              disabled={disabled || part !== null}
            >
              <SelectTrigger id="product-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={KindEnum.component}>Component</SelectItem>
                <SelectItem value={KindEnum.kit}>Kit</SelectItem>
              </SelectContent>
            </Select>
            {!part && isKit ? (
              <p className="mt-1 text-xs text-muted-foreground">
                A kit is a bill of materials. This form creates the catalog entry; its contents are
                loaded separately.
              </p>
            ) : null}
          </Field>

          <Field
            label="Description"
            required
            htmlFor="product-description"
            error={shown.description}
          >
            <Textarea
              id="product-description"
              value={values.description}
              maxLength={MAX_DESCRIPTION_LENGTH}
              rows={2}
              autoFocus
              disabled={disabled}
              onChange={(event) => update('description', event.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              The catalog label — what every list, picker and stock row shows for this part. Lead
              with the group it belongs to, as the catalog does: “Screws 08mm Ti”.
            </p>
          </Field>

          <Field
            label="Reference #"
            hint={isKit ? ' (kits carry none)' : ' (optional)'}
            htmlFor="product-reference-number"
            error={shown.referenceNumber}
          >
            <Input
              id="product-reference-number"
              value={values.referenceNumber}
              maxLength={MAX_REFERENCE_NUMBER_LENGTH}
              className="font-mono"
              // Not `type="number"`: a catalog number is an identifier, not a
              // quantity, and it is routinely alphanumeric.
              disabled={disabled}
              onChange={(event) => update('referenceNumber', event.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              The scan target. Unique per manufacturer, not across the catalog.
            </p>
          </Field>

          <Field label="UDI" hint=" (optional)" htmlFor="product-udi" error={shown.udi}>
            <Input
              id="product-udi"
              value={values.udi}
              maxLength={MAX_UDI_LENGTH}
              className="font-mono"
              disabled={disabled}
              onChange={(event) => update('udi', event.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Unique across every active part, so a UDI names exactly one product.
            </p>
          </Field>

          <Field
            label="Price"
            hint=" (optional)"
            htmlFor="product-list-price"
            error={shown.listPrice}
          >
            <Input
              id="product-list-price"
              value={values.listPrice}
              inputMode="decimal"
              placeholder="0.00"
              disabled={disabled}
              onChange={(event) => update('listPrice', event.target.value)}
            />
          </Field>

          <div className="sm:col-span-2">
            {/*
              A checkbox rather than a two-option Select: it is one boolean, and
              the consequence is worth spelling out beside it rather than hiding
              in two opaque labels.
            */}
            <div className="flex items-start gap-2.5">
              <Checkbox
                id="product-is-serialized"
                checked={values.isSerialized}
                disabled={disabled}
                onCheckedChange={(checked) => update('isSerialized', checked === true)}
                className="mt-0.5"
              />
              <div>
                <Label htmlFor="product-is-serialized" className="font-medium">
                  Serialized
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Stocked one row per physical unit, each with its own lot and expiry. Leave clear
                  for bulk parts, which are stocked one row per location with a quantity.
                </p>
              </div>
            </div>
          </div>
        </div>

        {save.error && !hasProductErrors(serverErrors) ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {saveErrorMessage(save.error)}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={disabled}>
            Cancel
          </Button>
          <Button type="submit" disabled={disabled}>
            {disabled ? (
              <span
                className="size-5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
                role="status"
                aria-label="Saving"
              />
            ) : part ? (
              'Save'
            ) : (
              'Add product'
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}

/** What the server said that no field could show. */
function saveErrorMessage(error: unknown): string {
  for (const [field, messages] of Object.entries(asFieldErrors(error) ?? {})) {
    const first = messages[0];
    if (!PRODUCT_FIELD_KEYS.includes(field) && first) return first;
  }
  return errorMessage(error);
}
