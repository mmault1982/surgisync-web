import { useQuery } from '@tanstack/react-query';

import { KindEnum } from '@/api/generated/model';
import { Field } from '@/components/field';
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

import { partFormManufacturersQuery } from '../catalog.queries';
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_REFERENCE_NUMBER_LENGTH,
  MAX_UDI_LENGTH,
  type ProductErrors,
  type ProductValues,
} from '../product';

/**
 * The seven controls a catalog part is written with.
 *
 * Lifted out of `product-form-screen.tsx` when the Receive form's Add product
 * dialog became the second caller — the same move `field.tsx`, `part-lookup.ts`
 * and `auth/permissions.ts` each record making. That screen's docstring already
 * said why two copies would be wrong: they differ in a heading and a request,
 * and two near-identical seven-field forms is how the required markers on one
 * of them go stale.
 *
 * Presentational and uncontrolled by anything but its props — the values, their
 * errors and one `onChange` — so the page keeps its create/edit mutation and
 * the dialog keeps its own. It does own the manufacturer query, because both
 * callers want the identical picker and drilling four pieces of query state
 * through props to say so would be worse.
 *
 * The two callers are never mounted at once, so the field ids stay bare.
 */
export function ProductFields({
  values,
  errors,
  disabled,
  kindLocked,
  kindHint,
  onChange,
}: {
  values: ProductValues;
  errors: ProductErrors;
  disabled: boolean;
  /**
   * Whether `kind` is fixed. It is on edit, because the server refuses it —
   * `kind` decides which identity space the row lives in, `source_kind` is
   * stamped once at creation, and the sync service, the CSV export and the
   * orphan sweep all partition the catalog table on it. It is also fixed from
   * the Receive form, where the part is being created to carry a catalog
   * number and kits carry none.
   */
  kindLocked: boolean;
  /** The parenthetical saying why, when it is locked. */
  kindHint?: string;
  onChange: <K extends keyof ProductValues>(field: K, value: ProductValues[K]) => void;
}) {
  const manufacturers = useQuery(partFormManufacturersQuery());
  const isKit = values.kind === KindEnum.kit;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field
        label="Manufacturer"
        required
        htmlFor="product-manufacturer"
        error={errors.manufacturer}
      >
        <Select
          value={values.manufacturer}
          onValueChange={(value) => onChange('manufacturer', value)}
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

      <Field label="Kind" required htmlFor="product-kind" hint={kindHint} error={errors.kind}>
        <Select
          value={values.kind}
          onValueChange={(value) => onChange('kind', value as KindEnum)}
          disabled={disabled || kindLocked}
        >
          <SelectTrigger id="product-kind" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={KindEnum.component}>Component</SelectItem>
            <SelectItem value={KindEnum.kit}>Kit</SelectItem>
          </SelectContent>
        </Select>
        {!kindLocked && isKit ? (
          <p className="mt-1 text-xs text-muted-foreground">
            A kit is a bill of materials. This form creates the catalog entry; its contents are
            loaded separately.
          </p>
        ) : null}
      </Field>

      <Field label="Description" required htmlFor="product-description" error={errors.description}>
        <Textarea
          id="product-description"
          value={values.description}
          maxLength={MAX_DESCRIPTION_LENGTH}
          rows={2}
          autoFocus
          disabled={disabled}
          onChange={(event) => onChange('description', event.target.value)}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          The catalog label — what every list, picker and stock row shows for this part. Lead with
          the group it belongs to, as the catalog does: “Screws 08mm Ti”.
        </p>
      </Field>

      <Field
        label="Reference #"
        hint={isKit ? ' (kits carry none)' : ' (optional)'}
        htmlFor="product-reference-number"
        error={errors.referenceNumber}
      >
        <Input
          id="product-reference-number"
          value={values.referenceNumber}
          maxLength={MAX_REFERENCE_NUMBER_LENGTH}
          className="font-mono"
          // Not `type="number"`: a catalog number is an identifier, not a
          // quantity, and it is routinely alphanumeric.
          disabled={disabled}
          onChange={(event) => onChange('referenceNumber', event.target.value)}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          The scan target. Unique per manufacturer, not across the catalog.
        </p>
      </Field>

      <Field label="UDI" hint=" (optional)" htmlFor="product-udi" error={errors.udi}>
        <Input
          id="product-udi"
          value={values.udi}
          maxLength={MAX_UDI_LENGTH}
          className="font-mono"
          disabled={disabled}
          onChange={(event) => onChange('udi', event.target.value)}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Unique across every active part, so a UDI names exactly one product.
        </p>
      </Field>

      <Field label="Price" hint=" (optional)" htmlFor="product-list-price" error={errors.listPrice}>
        <Input
          id="product-list-price"
          value={values.listPrice}
          inputMode="decimal"
          placeholder="0.00"
          disabled={disabled}
          onChange={(event) => onChange('listPrice', event.target.value)}
        />
      </Field>

      <div className="sm:col-span-2">
        {/*
          A checkbox rather than a two-option Select: it is one boolean, and the
          consequence is worth spelling out beside it rather than hiding in two
          opaque labels.
        */}
        <div className="flex items-start gap-2.5">
          <Checkbox
            id="product-is-serialized"
            checked={values.isSerialized}
            disabled={disabled}
            onCheckedChange={(checked) => onChange('isSerialized', checked === true)}
            className="mt-0.5"
          />
          <div>
            <Label htmlFor="product-is-serialized" className="font-medium">
              Serialized
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Stocked one row per physical unit, each with its own lot and expiry. Leave clear for
              bulk parts, which are stocked one row per location with a quantity.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
