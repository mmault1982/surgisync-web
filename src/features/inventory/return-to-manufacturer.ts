import { asFieldErrors, errorMessage } from '@/api/errors';
import type { InventoryKitDetail, InventoryTransferDetailRequest } from '@/api/generated/model';
import { ReasonEnum, TransportMethodEnum } from '@/api/generated/model';

import {
  currentAssignment,
  ORGANIZATION,
  sideFields,
  toDateInput,
  type StagedFile,
} from './transfer';

/**
 * Everything the Return to Manufacturer dialog decides, with no DOM in sight.
 *
 * A return is **not its own resource**: it is an inventory transfer with
 * `reason: 'return'` whose `to` side names no representative and no facility.
 * That is literally the backend's test for one — `_is_return_to_manufacturer`
 * in `inventory/views_inventory_transfer.py` — and it is why this screen needed
 * no new endpoint. Name a rep or a facility on the `to` side and the kits land
 * with a new holder instead of leaving inventory.
 *
 * Shares the wire-level machinery with `transfer.ts` (column expansion, staged
 * files, error slotting) and keeps only what genuinely differs here.
 */

export interface ReturnFormValues {
  /**
   * The user's free-text reason.
   *
   * Deliberately not called `reason`: the wire's `reason` is the `ReasonEnum`
   * and is always `return`. This is prose, and it ends up inside `notes`.
   */
  returnReason: string;
  isComplete: boolean;
  transport: TransportMethodEnum | null;
  kitPhoto: StagedFile | null;
  labelPhoto: StagedFile | null;
  notes: string;
}

export function seedReturnForm(kit: InventoryKitDetail): ReturnFormValues {
  return {
    returnReason: '',
    // The condition the kit claims today, which the user then confirms or
    // corrects. Mobile seeds the same way.
    isComplete: kit.is_complete ?? true,
    transport: null,
    kitPhoto: null,
    labelPhoto: null,
    notes: '',
  };
}

/**
 * The reason and condition, folded into the transfer's one notes field.
 *
 * The format is mobile's, exactly. A return's audit trail is read across both
 * clients, and a record that reads differently depending on which app created
 * it is worse than one that reads awkwardly in both. The transfer has no
 * dedicated column for either value, which is why this exists at all.
 */
export function composeReturnNotes(values: ReturnFormValues): string {
  const condition = values.isComplete ? 'Complete' : 'Incomplete';
  const head = `Return reason: ${values.returnReason.trim()} · Condition: ${condition}`;
  const extra = values.notes.trim();
  return extra ? `${head}\n\n${extra}` : head;
}

/**
 * Where the kit is going.
 *
 * The owning organization, with the representative and facility columns left
 * absent — that absence is what makes this a return. A kit with no owning org
 * sends no `to` side at all, which still satisfies the backend's test.
 */
function returnDestination(kit: InventoryKitDetail) {
  if (kit.parent_company == null) return null;
  return {
    type: ORGANIZATION,
    id: kit.parent_company,
    name: kit.parent_company_name ?? '',
  } as const;
}

export function buildReturnBody(
  kit: InventoryKitDetail,
  values: ReturnFormValues,
  today = new Date(),
): InventoryTransferDetailRequest {
  return {
    // An array of one, as Transfer sends. Group returns are a later caller.
    stock_items: [kit.id],
    // The enum, always. The user's prose is in `notes`.
    reason: ReasonEnum.return,
    // Non-null by the time this runs; validation gates the save.
    transport_method: values.transport ?? TransportMethodEnum.rep,
    // No date picker on this screen — mobile stamps the moment of submission.
    transfer_date: toDateInput(today),
    ...sideFields('from', currentAssignment(kit)),
    ...sideFields('to', returnDestination(kit)),
    notes: composeReturnNotes(values),
    ...(values.kitPhoto ? { kit_photo: values.kitPhoto.file } : {}),
    // Always sent, unlike Transfer, where the label is a carrier-only field.
    ...(values.labelPhoto ? { label_photo: values.labelPhoto.file } : {}),
  };
}

export interface ReturnFormErrors {
  returnReason?: string;
  transport?: string;
  photos?: string;
}

/**
 * The client-side rules. The server requires none of them.
 *
 * **Both photos are required for every transport method**, including Rep
 * Transport — this is where a return differs from a transfer, whose shipping
 * label is only wanted for FedEx and UPS. A return always ships to the
 * manufacturer, so `requiresLabelPhoto` is deliberately not consulted here.
 */
export function validateReturnForm(values: ReturnFormValues): ReturnFormErrors {
  const errors: ReturnFormErrors = {};

  if (!values.returnReason.trim()) {
    errors.returnReason = 'Please enter a reason for the return';
  }
  if (!values.transport) {
    errors.transport = 'Please select a transport method';
  } else if (!values.kitPhoto) {
    errors.photos = 'A kit photo is required';
  } else if (!values.labelPhoto) {
    errors.photos = 'A shipping label photo is required';
  }

  return errors;
}

export function hasReturnErrors(errors: ReturnFormErrors): boolean {
  return Object.values(errors).some(Boolean);
}

/**
 * Which form slot each field the server rejected belongs under.
 *
 * Deliberately its own map rather than `transfer.ts`'s. That one slots the
 * route fields under From and To, which this form does not have — reusing it
 * would mark those errors as handled and then render them nowhere. Here they
 * are unslotted on purpose, so `returnErrorMessage` surfaces them in the
 * form-level alert instead. The same goes for `stock_items`, which is where an
 * "already in transit" rejection arrives.
 */
const FIELD_SLOTS: Record<string, keyof ReturnFormErrors> = {
  transport_method: 'transport',
  kit_photo: 'photos',
  label_photo: 'photos',
  notes: 'returnReason',
};

export function returnFieldErrors(error: unknown): ReturnFormErrors {
  const fields = asFieldErrors(error);
  if (!fields) return {};

  const errors: ReturnFormErrors = {};
  for (const [field, messages] of Object.entries(fields)) {
    const slot = FIELD_SLOTS[field];
    const message = messages[0];
    if (!slot || !message) continue;
    errors[slot] = errors[slot] ? `${errors[slot]} ${message}` : message;
  }
  return errors;
}

/** The form-level alert: what the server said, else the house generic copy. */
export function returnErrorMessage(error: unknown): string {
  for (const [field, messages] of Object.entries(asFieldErrors(error) ?? {})) {
    const first = messages[0];
    if (!FIELD_SLOTS[field] && first) return first;
  }
  return errorMessage(error);
}
