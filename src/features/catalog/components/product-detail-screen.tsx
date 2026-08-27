import { PencilIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { KindEnum, type PartDetail } from '@/api/generated/model';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import { formatPrice } from '../product';

/**
 * One catalog part's record.
 *
 * Presentational: props only, no hooks, no navigation and no data fetching —
 * the same split every other screen in this feature makes, and what lets this
 * render in a test with no router and no query client.
 *
 * The layout is Kit Detail's info card: a brand header strip over a
 * label/value grid, as a `<dl>`, because that is exactly what it is. Unlike
 * Kit Detail there is no second column — a catalog part has no location, no
 * activity and no actions beyond Edit, so a right-hand rail would be an empty
 * one.
 */
export function ProductDetailScreen({
  part,
  canManage,
  onEdit,
}: {
  part: PartDetail;
  /** Whole button, not a disabled one: a control nobody can use is noise. */
  canManage: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="@container">
      <Card className="max-w-3xl gap-0 overflow-hidden py-0">
        <CardHeader className="bg-primary py-4 text-primary-foreground">
          <div className="flex flex-wrap items-center gap-2.5">
            {/*
              `description`, not `name`. The latter is a deprecated read-only
              alias of it, and this is the field the catalog is labelled by.
            */}
            <h2 className="font-heading text-lg font-bold">{part.description}</h2>
            <Badge className="border-primary-foreground/25 bg-primary-foreground/20 text-primary-foreground">
              {part.kind === KindEnum.kit ? 'Kit' : 'Component'}
            </Badge>
          </div>
          <p className="text-sm text-primary-foreground/85">{part.manufacturer_name}</p>
        </CardHeader>

        <CardContent className="py-5">
          <dl className="grid grid-cols-1 gap-4 @sm:grid-cols-2">
            <Detail label="Manufacturer">{part.manufacturer_name}</Detail>
            {/*
              Monospace, and the em dash rather than a blank: kits carry no
              catalog number at all, so the cell says "not applicable" rather
              than looking like something failed to load.
            */}
            <Detail label="Reference #" className="font-mono text-xs">
              {part.reference_number || '—'}
            </Detail>
            <Detail label="Kind">{part.kind === KindEnum.kit ? 'Kit' : 'Component'}</Detail>
            <Detail label="Stocking">
              {part.is_serialized ? 'Serialized' : 'Bulk'}
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {part.is_serialized
                  ? 'One row per physical unit, with its own lot and expiry.'
                  : 'One row per location, with a quantity.'}
              </span>
            </Detail>
            <Detail label="UDI" className="font-mono text-xs">
              {part.udi || '—'}
            </Detail>
            <Detail label="Price">{formatPrice(part.list_price)}</Detail>
            {/*
              Description and Category share the last row rather than
              Description spanning it. Description is up to 256 characters, so
              a half-width cell wraps it over several lines — which the grid
              absorbs, since a row stretches to its tallest cell and Category
              simply sits top-aligned beside it.
            */}
            <Detail label="Description">{part.description}</Detail>
            {/*
              Blank on every row created through this app before the field was
              writable, so the em dash carries the same "nothing here" meaning
              it does on the listing.
            */}
            <Detail label="Category">{part.category || '—'}</Detail>
          </dl>

          {canManage ? (
            <div className="mt-6 flex">
              <Button type="button" variant="outline" onClick={onEdit}>
                <PencilIcon />
                Edit product
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className={cn('mt-0.5 text-sm text-foreground', className)}>{children}</dd>
    </div>
  );
}
