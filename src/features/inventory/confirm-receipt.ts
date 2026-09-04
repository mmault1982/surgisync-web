import type { InventoryTransferDetail } from '@/api/generated/model';
import { ReasonEnum } from '@/api/generated/model';
import { formatCalendarDate, formatLogDateTime } from '@/lib/dates';

import type { PhotoTileData } from './components/photo-tile';
import { EMPTY } from './kit-detail';
import { transportLabel, REASON_OPTIONS } from './transfer';

/**
 * What the Pending Transfer dialog needs to decide and to show.
 *
 * The one rule with teeth is `isReturnToManufacturer`, because the two kinds of
 * transfer end very differently and the dialog has to say which one it is
 * *before* the user confirms.
 */

/**
 * Whether confirming this transfer will remove the kits from inventory.
 *
 * Mirrors `_is_return_to_manufacturer` (`inventory/views_inventory_transfer.py`)
 * exactly, including what it leaves out: a return may name a destination
 * **organization** and still be a return. Only a representative or a facility
 * on the `to` side makes it an ordinary move.
 *
 * Getting this wrong in either direction is bad in a way a user notices. Read
 * as ordinary, a return confirms with copy promising the kit lands somewhere
 * and then deletes it. Read as a return, an ordinary transfer warns that a kit
 * is leaving inventory when it is only changing hands.
 */
export function isReturnToManufacturer(transfer: InventoryTransferDetail): boolean {
  return (
    transfer.reason === ReasonEnum.return &&
    transfer.to_assigned_to_facility == null &&
    transfer.to_assigned_to_representative == null
  );
}

/** Where the kits are going, as the API named it. */
export function destinationName(transfer: InventoryTransferDetail): string | null {
  return (
    transfer.to_representative_name ??
    transfer.to_facility_name ??
    transfer.to_parent_company_name ??
    null
  );
}

/** Where they came from. Null when the transfer named no source. */
export function originName(transfer: InventoryTransferDetail): string | null {
  return (
    transfer.from_representative_name ??
    transfer.from_facility_name ??
    transfer.from_parent_company_name ??
    null
  );
}

export interface TransferFact {
  label: string;
  value: string;
}

/**
 * The read-only rows under the route.
 *
 * Reason is shown even though a return already says so in the banner above it:
 * "Surgery" versus "Restock" is the difference between a kit that is expected
 * back and one that is not, and it is the only place this app surfaces it.
 */
export function transferFacts(transfer: InventoryTransferDetail): TransferFact[] {
  const reason = REASON_OPTIONS.find((option) => option.value === transfer.reason);
  return [
    { label: 'Reason', value: reason?.label ?? transfer.reason },
    { label: 'Transport', value: transportLabel(transfer.transport_method) || EMPTY },
    { label: 'Sent', value: formatCalendarDate(transfer.transfer_date) ?? EMPTY },
  ];
}

/**
 * The transfer's photos, in the order the create form captures them.
 *
 * Absent photos are dropped rather than shown as empty tiles, which is the
 * opposite of what a kit's gallery does with a null `url` — and deliberately.
 * There, null means a photo exists and the server has not finished processing
 * it; here it means no photo was ever taken, which is routine: only FedEx and
 * UPS want the shipping label photographed (`requiresLabelPhoto`), and a rep
 * hand-carrying the kit is never asked for one.
 *
 * Both captions read the transfer's own `created_at`, because a transfer has no
 * per-photo timestamp. That instant is when the files were attached — the
 * create saves the row to get a PK, then re-saves with the photos — so it is
 * the true answer rather than a stand-in. `transfer_date` is not: it is a bare
 * calendar date the user picks, and it is already shown as the "Sent" fact.
 */
export function transferPhotos(
  transfer: InventoryTransferDetail,
  now = new Date(),
): PhotoTileData[] {
  const takenAt = formatLogDateTime(transfer.created_at, now);
  const photos: PhotoTileData[] = [
    { id: 'kit', label: 'Kit Photo', url: transfer.kit_photo ?? null, takenAt, caption: null },
    {
      id: 'label',
      label: 'Shipping Label',
      url: transfer.label_photo ?? null,
      takenAt,
      caption: null,
    },
  ];
  return photos.filter((photo) => photo.url !== null);
}

/**
 * Copy for the confirm button and its explanation, which differ by kind.
 *
 * A return is the destructive one: the kits are soft-deleted along with the
 * transfer, so the kit page the user is standing on stops existing. Saying so
 * plainly beforehand is the whole reason this dialog asks rather than acts.
 */
export function confirmCopy(transfer: InventoryTransferDetail): {
  action: string;
  detail: string;
  removesKit: boolean;
} {
  if (isReturnToManufacturer(transfer)) {
    return {
      action: 'Confirm Return',
      detail:
        'Confirming closes the return and removes this kit from your inventory. You will be taken back to Manage On-Hand.',
      removesKit: true,
    };
  }
  const destination = destinationName(transfer);
  return {
    action: 'Confirm Receipt',
    detail: destination
      ? `Confirming hands the kit over to ${destination} and ends the transfer.`
      : 'Confirming hands the kit over to its destination and ends the transfer.',
    removesKit: false,
  };
}
