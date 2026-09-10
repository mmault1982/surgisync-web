import { PencilIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import type { FacilityDetail } from '@/api/generated/model';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatCalendarDate } from '@/lib/dates';
import { cn } from '@/lib/utils';

import { COMPANY_FIELDS } from '../company-form';
import { ACCREDITATION_STATUS_LABELS, FACILITY_TYPE_LABELS } from '../facility-labels';

/**
 * One facility's record.
 *
 * Presentational: props only, no hooks, no navigation and no data fetching —
 * the same split every other screen in this feature makes, and what lets this
 * render in a test with no router and no query client.
 *
 * The layout is Manufacturer Detail's: a brand header strip over label/value
 * grids as `<dl>`s. Six groups rather than three, because "Email" appears in
 * three of them and a facility carries three compliance blocks besides.
 *
 * **The contact blocks come first**, then the facility's own affiliations,
 * identifiers and licensing. Who to call is what someone opening this record
 * is usually after; a GPO member ID is reference data they look up
 * deliberately.
 *
 * The address book is a sibling card mounted by the route, not part of this —
 * it needs a query client and three dialogs, and this deliberately needs
 * neither.
 */
export function FacilityDetailScreen({
  facility,
  canManage,
  onEdit,
}: {
  facility: FacilityDetail;
  /** Whole button, not a disabled one: a control nobody can use is noise. */
  canManage: boolean;
  onEdit: () => void;
}) {
  const { company } = facility;
  // Writes against a row this organization does not own are 404s, so the
  // control would only teach that on submit. The table applies the same rule.
  const editable = canManage && facility.is_owned;
  const deactivated = facility.is_active === false;

  return (
    <div className="@container">
      <Card className="max-w-3xl gap-0 overflow-hidden py-0">
        <CardHeader className="bg-primary py-4 text-primary-foreground">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="font-heading text-lg font-bold">{facility.name}</h2>
            {facility.is_owned ? null : (
              <Badge className="border-primary-foreground/25 bg-primary-foreground/20 text-primary-foreground">
                Read only
              </Badge>
            )}
            {deactivated ? (
              <Badge className="border-primary-foreground/25 bg-primary-foreground/20 text-primary-foreground">
                Deactivated
              </Badge>
            ) : null}
          </div>
          {/* The type alone. Onboarding status is listing data — the
              Facilities table shows it as a column and filters on it — and it
              is not part of this record's identity. */}
          <p className="text-sm text-primary-foreground/85">
            {facility.facility_type ? FACILITY_TYPE_LABELS[facility.facility_type] : 'Facility'}
          </p>
        </CardHeader>

        <CardContent className="space-y-6 py-5">
          {/*
            Said once, where it is true, rather than left to be discovered from
            the row's absence in a picker somewhere else.
          */}
          {deactivated ? (
            <p className="rounded-lg bg-warning-container px-3 py-2 text-sm text-warning-foreground">
              This facility is deactivated. It keeps its name and everything already pointing at it,
              but it is not offered in case, quote or transfer destination pickers. Reactivate it
              from the Facilities list.
            </p>
          ) : null}

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
            optional server-side, so an all-em-dash card would otherwise read
            as something that failed.
          */}
          {COMPANY_FIELDS.every((field) => !company[field]) ? (
            <p className="text-sm text-muted-foreground">
              No contact details recorded for this facility yet.
            </p>
          ) : null}

          <Group title="Affiliations">
            <Detail label="GPO affiliation">{value(facility.gpo_affiliation)}</Detail>
            <Detail label="GPO member ID">{value(facility.gpo_member_id)}</Detail>
            <Detail label="IDN affiliation" wrapperClassName="@sm:col-span-2">
              {value(facility.idn_affiliation)}
            </Detail>
          </Group>

          <Group title="Identifiers">
            <Detail label="NPI number">{value(facility.npi_number)}</Detail>
            <Detail label="Tax ID / EIN">{value(facility.tax_id)}</Detail>
            <Detail label="DEA number">{value(facility.dea_number)}</Detail>
          </Group>

          <Group title="Licensing and accreditation">
            <Detail label="State licence number">{value(facility.state_license_number)}</Detail>
            {/*
              `formatCalendarDate`, never `new Date(...)`: these are plain
              `YYYY-MM-DD` dates with no timezone, and constructing a Date from
              one parses it as UTC midnight and can render the day before.
            */}
            <Detail label="Licence expires">
              {formatCalendarDate(facility.state_license_expiration) ?? EMPTY}
            </Detail>
            <Detail label="Accreditation">
              {facility.accreditation_status
                ? ACCREDITATION_STATUS_LABELS[facility.accreditation_status]
                : EMPTY}
            </Detail>
            <Detail label="Accreditation expires">
              {formatCalendarDate(facility.accreditation_expiration) ?? EMPTY}
            </Detail>
          </Group>

          {facility.notes?.trim() ? (
            <section>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Notes
              </h3>
              {/* `whitespace-pre-line`: it is a TextField, and the line breaks
                  someone typed are part of what they wrote. */}
              <p className="text-sm whitespace-pre-line text-foreground">{facility.notes}</p>
            </section>
          ) : null}

          {editable ? (
            <div className="flex">
              <Button type="button" variant="outline" onClick={onEdit}>
                <PencilIcon />
                Edit facility
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

/** The em dash rather than a blank: an empty cell reads as a load that failed. */
const EMPTY = '—';

function value(field: string | undefined): string {
  return field?.trim() || EMPTY;
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
