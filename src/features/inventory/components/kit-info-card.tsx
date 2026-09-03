import type { InventoryKitDetail } from '@/api/generated/model';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import { kitFields, ownershipLabel } from '../kit-detail';

import { KitPhotos } from './kit-photos';

/** Shared so the photos row below cannot drift from the mapped fields. */
const LABEL = 'text-xs font-semibold tracking-wide text-muted-foreground uppercase';

/**
 * The kit's record: a brand header strip over a label/value grid.
 *
 * `Card`'s own `py-(--card-spacing)` is zeroed so the strip reaches the card's
 * edges; its `overflow-hidden rounded-xl` then clips the strip's top corners
 * for free.
 *
 * `@container` because `Card` declares none of its own — only `CardHeader`
 * does, and that one is named. Without it the `@` variants below resolve
 * against the page wrapper, which is not the same width: at `@4xl` the detail
 * route splits into `1.4fr 1fr` and this card becomes ~58% of that container.
 * The photos grid needs the card's real width to cap its columns.
 */
export function KitInfoCard({ kit, className }: { kit: InventoryKitDetail; className?: string }) {
  const ownership = ownershipLabel(kit);

  return (
    <Card className={cn('@container gap-0 py-0', className)}>
      <CardHeader className="bg-primary py-4 text-primary-foreground">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="font-heading text-lg font-bold">{kit.part_name}</h2>
          {ownership ? (
            <Badge className="border-primary-foreground/25 bg-primary-foreground/20 text-primary-foreground">
              {ownership}
            </Badge>
          ) : null}
        </div>
        {kit.manufacturer_kit_id ? (
          <p className="font-mono text-sm text-primary-foreground/85">
            Kit ID: {kit.manufacturer_kit_id}
          </p>
        ) : null}
      </CardHeader>

      <CardContent className="py-5">
        {/*
          A description list, because that is exactly what this is. The inner
          breakpoint is a container query too, so the grid reacts to the card's
          own width rather than the viewport's.
        */}
        <dl className="grid grid-cols-1 gap-4 @sm:grid-cols-2">
          {kitFields(kit).map((field) => (
            <div key={field.label} className={cn(field.full && '@sm:col-span-2')}>
              <dt className={LABEL}>{field.label}</dt>
              <dd
                className={cn(
                  'mt-0.5 text-sm text-foreground',
                  field.emphasis === 'expired' && 'font-semibold text-destructive',
                )}
              >
                {field.value}
              </dd>
            </div>
          ))}

          {/* An eighth field in every respect but its type — full width like
              ENTITY, which it sits directly under. */}
          <div className="@sm:col-span-2">
            <dt className={LABEL}>Photos</dt>
            <dd className="mt-0.5 text-sm text-foreground">
              <KitPhotos kit={kit} />
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}
