import { BanIcon } from 'lucide-react';

import type { InventoryKitDetail } from '@/api/generated/model';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import { EMPTY, ownershipLabel } from '../kit-detail';
import { isExpired } from '../stock-status';

/**
 * The furniture every kit dialog opens with.
 *
 * Extracted when Transfer became the second one: the summary card and the
 * labelled field were identical in both, and the expired banner differed only
 * in its second line. Two copies of a label's required-marker is how the two
 * quietly stop matching.
 */

/** The kit this dialog is about: name, id, ownership. */
export function KitSummary({ kit }: { kit: InventoryKitDetail }) {
  const ownership = ownershipLabel(kit);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{kit.part_name}</p>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
          {kit.manufacturer_kit_id ?? EMPTY}
        </p>
      </div>
      {ownership ? <Badge variant="secondary">{ownership}</Badge> : null}
    </div>
  );
}

/**
 * Informational only, in both dialogs — nothing either one offers is restricted
 * by it.
 *
 * `detail` is the caller's, because the useful next step differs: Update Status
 * asks for the condition to be recorded first, Transfer points at Return to
 * Manufacturer. Renders nothing for a kit that has not expired.
 */
export function ExpiredBanner({
  kit,
  detail,
}: {
  kit: InventoryKitDetail;
  detail: React.ReactNode;
}) {
  if (!isExpired(kit)) return null;
  return (
    <div className="flex items-start gap-3 rounded-lg border-l-4 border-l-destructive bg-brand-container px-4 py-3.5">
      <BanIcon aria-hidden className="size-5 shrink-0 text-destructive" />
      <div>
        <p className="text-sm font-bold text-destructive">Expired — kit cannot be used</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

/** A labelled control with an optional required marker, hint and error. */
export function Field({
  label,
  required,
  hint,
  hintTone,
  htmlFor,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  hintTone?: string;
  htmlFor?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor} className="mb-2">
        {label}
        {required ? <span className="text-destructive">*</span> : null}
        {hint ? (
          <span className={cn('font-normal text-muted-foreground', hintTone)}>{hint}</span>
        ) : null}
      </Label>
      {children}
      {error ? <p className="mt-1 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
