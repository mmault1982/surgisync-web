import { PencilIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import type { ManufacturerDetail } from '@/api/generated/model';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import { COMPANY_FIELDS } from '../company-form';

/**
 * One manufacturer's record.
 *
 * Presentational: props only, no hooks, no navigation and no data fetching —
 * the same split every other screen in this feature makes, and what lets this
 * render in a test with no router and no query client.
 *
 * The layout is Product Detail's: a brand header strip over a label/value grid
 * as a `<dl>`, because that is exactly what it is. Three groups rather than
 * one, because "Email" appears in all three and a flat list of eleven rows
 * would not say which is which.
 *
 * The address book is a sibling card mounted by the route, not part of this —
 * it needs a query client and three dialogs, and this deliberately needs
 * neither.
 */
export function ManufacturerDetailScreen({
  manufacturer,
  canManage,
  onEdit,
}: {
  manufacturer: ManufacturerDetail;
  /** Whole button, not a disabled one: a control nobody can use is noise. */
  canManage: boolean;
  onEdit: () => void;
}) {
  const { company } = manufacturer;
  // Writes against a row this organization does not own are 404s, so the
  // control would only teach that on submit. The table applies the same rule.
  const editable = canManage && manufacturer.is_owned;

  return (
    <div className="@container">
      <Card className="max-w-3xl gap-0 overflow-hidden py-0">
        <CardHeader className="bg-primary py-4 text-primary-foreground">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="font-heading text-lg font-bold">{manufacturer.name}</h2>
            {manufacturer.is_owned ? null : (
              <Badge className="border-primary-foreground/25 bg-primary-foreground/20 text-primary-foreground">
                Shared
              </Badge>
            )}
          </div>
          {/*
            Whether a barcode exists, not the image. It encodes the name and is
            generated server-side, so it is a health signal — a row without one
            is a row something skipped — which is how the table reads it too.
          */}
          <p className="text-sm text-primary-foreground/85">
            {manufacturer.barcode ? 'Barcode generated' : 'No barcode generated'}
          </p>
        </CardHeader>

        <CardContent className="space-y-6 py-5">
          <Group title="Organization contact">
            <Detail label="Phone">{value(company.phone)}</Detail>
            <Detail label="Fax">{value(company.fax)}</Detail>
            <Detail label="Email" wrapperClassName="@sm:col-span-2">
              {value(company.email)}
            </Detail>
          </Group>

          <Group title="Contact person">
            <Detail label="Name">{value(company.contact_name)}</Detail>
            <Detail label="Title">{value(company.contact_title)}</Detail>
            <Detail label="Email">{value(company.contact_email)}</Detail>
            <Detail label="Phone">{value(company.contact_phone)}</Detail>
          </Group>

          <Group title="Billing contact">
            <Detail label="Name">{value(company.billing_contact_name)}</Detail>
            <Detail label="Email">{value(company.billing_contact_email)}</Detail>
            <Detail label="Phone">{value(company.billing_contact_phone)}</Detail>
          </Group>

          {/*
            Said once, quietly, where it is true. The whole contact block is
            optional server-side and no manufacturer carries one yet, so an
            all-em-dash card would otherwise read as something that failed.
          */}
          {COMPANY_FIELDS.every((field) => !company[field]) ? (
            <p className="text-sm text-muted-foreground">
              No contact details recorded for this manufacturer yet.
            </p>
          ) : null}

          {editable ? (
            <div className="flex">
              <Button type="button" variant="outline" onClick={onEdit}>
                <PencilIcon />
                Edit manufacturer
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

/** The em dash rather than a blank: an empty cell reads as a load that failed. */
function value(field: string | undefined): string {
  return field?.trim() || '—';
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <dl className="grid grid-cols-1 gap-4 @sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Detail({
  label,
  className,
  wrapperClassName,
  children,
}: {
  label: string;
  /** Applied to the <dd>, for the value's own type treatment. */
  className?: string;
  /** Applied to the grid item, for spanning. */
  wrapperClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className={wrapperClassName}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 text-sm text-foreground', className)}>{children}</dd>
    </div>
  );
}
