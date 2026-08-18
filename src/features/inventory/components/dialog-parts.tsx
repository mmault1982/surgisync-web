import { BanIcon, ImagePlusIcon, XIcon } from 'lucide-react';

import type { InventoryKitDetail } from '@/api/generated/model';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import { EMPTY, ownershipLabel } from '../kit-detail';
import type { StagedFile } from '../transfer';
import { isExpired } from '../stock-status';

/**
 * The furniture every kit dialog opens with.
 *
 * Extracted when Transfer became the second one: the summary card and the
 * labelled field were identical in both, and the expired banner differed only
 * in its second line. Two copies of a label's required-marker is how the two
 * quietly stop matching.
 *
 * `Field` has since moved on to `@/components/field` — it knew nothing about
 * kits, and a second feature needed it. What is left here does know, and stays.
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

/**
 * One replaceable file.
 *
 * A label wrapping an `sr-only` input rather than a button that clicks a hidden
 * one, for the reason `update-status-dialog.tsx` records: the affordance the
 * user touches *is* the control, so it gets keyboard activation and an
 * accessible name for free.
 */
export function PhotoCapture({
  name,
  title,
  subtitle,
  staged,
  disabled,
  onPick,
}: {
  name: string;
  title: string;
  subtitle: string;
  staged: StagedFile | null;
  disabled: boolean;
  onPick: (file: File | null) => void;
}) {
  return (
    <div className="relative">
      <label
        className={cn(
          'flex h-32 w-40 cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border-2 border-dashed px-2 text-center',
          'focus-within:ring-2 focus-within:ring-ring',
          'has-disabled:pointer-events-none has-disabled:opacity-55',
          staged
            ? 'border-solid border-success bg-success-container'
            : 'border-primary bg-brand-container',
        )}
      >
        {staged ? (
          <img src={staged.previewUrl} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <>
            <ImagePlusIcon aria-hidden className="size-5 text-primary" />
            <span className="text-xs font-semibold text-foreground">{title}</span>
            <span className="text-[11px] text-muted-foreground">{subtitle}</span>
          </>
        )}
        <input
          type="file"
          accept="image/*"
          aria-label={staged ? `Replace ${title}` : `Add ${title}`}
          data-testid={name}
          className="sr-only"
          disabled={disabled}
          onChange={(event) => {
            onPick(event.target.files?.[0] ?? null);
            // Without this, picking the same file twice in a row fires no
            // change event.
            event.target.value = '';
          }}
        />
      </label>
      {staged ? (
        <button
          type="button"
          aria-label={`Remove ${title}`}
          disabled={disabled}
          onClick={() => onPick(null)}
          className="absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none"
        >
          <XIcon aria-hidden className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}
