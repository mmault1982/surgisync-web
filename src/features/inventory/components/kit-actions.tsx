import {
  ChevronRightIcon,
  MapPinIcon,
  RefreshCwIcon,
  SquarePenIcon,
  Undo2Icon,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';

import type { InventoryKitDetail } from '@/api/generated/model';
import { cn } from '@/lib/utils';

import { isExpired } from '../stock-status';

import { TransferDialog } from './transfer-dialog';
import { UpdateStatusDialog } from './update-status-dialog';

/**
 * What you can do to a kit.
 *
 * Update Status opens its dialog; transfer, returns and beacon pairing are
 * still no-ops, and land as their own screens. They render now because the
 * layout and the affordances are what this change is for, and because each one
 * is enabled or disabled by the kit's real state.
 *
 * These are plain `<button>`s rather than shadcn `Button`s on purpose: its cva
 * base pins `h-8`, `px-2.5` and a single inline row, and an action card is a
 * 40px icon beside two stacked lines. Overriding height, padding and layout on
 * a cva base is the "two sources of truth for one class" failure CLAUDE.md
 * documents for `data-active` — a bare button gives the semantics and keyboard
 * behaviour for free, and the ring is one utility.
 */
interface Action {
  key: string;
  icon: LucideIcon;
  iconClassName: string;
  title: string;
  /** Rendered small and muted beside the title: `· optional`, `· to Warehouse only`. */
  annotation?: string;
  description: string;
  disabled?: boolean;
  /**
   * Absent for the flows that do not exist yet, so the card visibly does
   * nothing. Deliberately not a toast: a "coming soon" popup on every click is
   * worse than a button that plainly has no effect.
   */
  onClick?: () => void;
  /** The prototype's tinted "you probably want this one" treatment. */
  highlight?: string;
}

export function KitActions({ kit, className }: { kit: InventoryKitDetail; className?: string }) {
  const expired = isExpired(kit);
  const inTransit = kit.active_transfer_id !== null;
  const [statusOpen, setStatusOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const actions: Action[] = [
    {
      key: 'status',
      icon: SquarePenIcon,
      iconClassName: 'bg-warning-container text-warning',
      title: 'Update Status',
      description: 'Complete, incomplete, wrapped, signed in…',
      disabled: inTransit,
      onClick: () => setStatusOpen(true),
    },
    {
      key: 'transfer',
      icon: RefreshCwIcon,
      iconClassName: 'bg-success-container text-success',
      title: 'Transfer',
      // No expired annotation. The prototype restricts an expired kit to
      // "Warehouse only", but mobile has no such rule and the backend has no
      // Warehouse — the copy promised a restriction nothing implements.
      description: 'Move to another rep or facility',
      // A kit already moving cannot be sent somewhere else; the pending
      // transfer has to be confirmed or cancelled first.
      disabled: inTransit,
      onClick: () => setTransferOpen(true),
    },
    {
      key: 'return',
      icon: Undo2Icon,
      iconClassName: 'bg-brand-container text-primary',
      title: 'Return to Manufacturer',
      ...(expired ? { annotation: '· recommended' } : {}),
      description: `Send back to ${kit.manufacturer_name}`,
      disabled: inTransit,
      ...(expired ? { highlight: 'border-primary ring-2 ring-primary/10' } : {}),
    },
  ];

  // Pairing is only offered for a kit that has no beacon; a tracked kit gets
  // the Live Location panel above instead.
  if (!kit.tracker) {
    actions.push({
      key: 'pair',
      icon: MapPinIcon,
      iconClassName: 'bg-info-container text-info',
      title: 'Pair Hansel Tracker',
      annotation: '· optional',
      description: 'Scan a Hansel tracker to enable real-time location',
      disabled: inTransit,
      highlight: 'border-info bg-info-container/40',
    });
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Actions
      </h2>
      {actions.map((action) => (
        <ActionCard key={action.key} action={action} />
      ))}

      {/*
        Mounted only while open, so the dialog's lifetime is the edit session:
        its staged changes and its "already PATCHed" latch cannot outlive a
        close, and every field reseeds from the kit on the next open.
      */}
      {statusOpen && <UpdateStatusDialog kit={kit} onClose={() => setStatusOpen(false)} />}
      {transferOpen && <TransferDialog kit={kit} onClose={() => setTransferOpen(false)} />}
    </div>
  );
}

function ActionCard({ action }: { action: Action }) {
  return (
    <button
      type="button"
      disabled={action.disabled}
      onClick={action.onClick}
      className={cn(
        'flex w-full items-center gap-3.5 rounded-lg border border-border bg-card p-4 text-left transition-colors',
        'hover:border-primary hover:shadow-sm',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        'disabled:pointer-events-none disabled:opacity-55',
        action.highlight,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-lg',
          action.iconClassName,
        )}
      >
        <action.icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">
          {action.title}
          {action.annotation ? (
            <span className="ml-1.5 text-xs font-medium text-muted-foreground">
              {action.annotation}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{action.description}</span>
      </span>
      <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-primary" />
    </button>
  );
}
