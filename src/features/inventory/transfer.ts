import { asFieldErrors, errorMessage } from '@/api/errors';
import type {
  InventoryKitDetail,
  InventoryTransferDetailRequest,
  TransferTarget,
} from '@/api/generated/model';
import { ReasonEnum, TransferTargetTypeEnum, TransportMethodEnum } from '@/api/generated/model';

/**
 * Everything the Transfer dialog decides, with no DOM in sight.
 *
 * Same split as `update-status.ts`: the target algebra, the per-method photo
 * rules and the payload shape are the parts worth testing, and none of them
 * need a render. Unlike Update Status there is no save module — a transfer is
 * one atomic request, so there is no ordering and no latch to model.
 */

// ── Targets ─────────────────────────────────────────────────────────────────

/**
 * A From/To option, keyed.
 *
 * Wider than the wire's `TransferTarget` by one case. The endpoint offers
 * representatives and facilities — organizations are deliberately not
 * destinations, matching mobile — but a kit can already *be* assigned to one,
 * and From has to be able to say so. `organization` therefore only ever
 * originates from the kit itself, never from the fetched list, and it writes
 * the third column the API has always had.
 *
 * The key is `type:id` throughout, never the bare id: representative 4 and
 * facility 4 are unrelated rows, so a numeric key would let the wrong one be
 * selected — and the resulting transfer would be wrong rather than rejected.
 */
export const ORGANIZATION = 'organization';

export type TargetType = TransferTargetTypeEnum | typeof ORGANIZATION;

export interface Target {
  type: TargetType;
  id: number;
  name: string;
}

export function targetKey(target: Pick<Target, 'type' | 'id'>): string {
  return `${target.type}:${target.id}`;
}

export function findTarget(targets: readonly Target[], key: string | null): Target | null {
  if (!key) return null;
  return targets.find((target) => targetKey(target) === key) ?? null;
}

/**
 * Which of the kit's three assignment columns holds its current holder.
 *
 * Checked most-specific first: a kit assigned to a rep at a facility has both
 * ids set, and the rep is who actually holds it.
 */
export function currentAssignment(kit: InventoryKitDetail): Target | null {
  if (kit.assigned_to_representative != null) {
    return {
      type: TransferTargetTypeEnum.representative,
      id: kit.assigned_to_representative,
      name: kit.assigned_to_name ?? `Representative ${kit.assigned_to_representative}`,
    };
  }
  if (kit.assigned_to_facility != null) {
    return {
      type: TransferTargetTypeEnum.facility,
      id: kit.assigned_to_facility,
      name: kit.assigned_to_facility_name ?? `Facility ${kit.assigned_to_facility}`,
    };
  }
  if (kit.assigned_to_parent_company != null) {
    return {
      type: ORGANIZATION,
      id: kit.assigned_to_parent_company,
      // There is no `assigned_to_parent_company_name` on the serializer, so the
      // owning org's name is only the right label when the kit is assigned to
      // the org that owns it — which is the ordinary case, but not the only one.
      name:
        (kit.assigned_to_parent_company === kit.parent_company ? kit.parent_company_name : null) ??
        'Current organization',
    };
  }
  return null;
}

/** The fetched options, widened to this client's target type. */
export function toTargets(results: readonly TransferTarget[]): Target[] {
  return results.map((result) => ({ type: result.type, id: result.id, name: result.name }));
}

/**
 * The fetched options, plus the kit's own holder if the fetch does not include
 * it.
 *
 * A rep who has since left the org, a facility the user is no longer assigned
 * to, or an organization — never offered — would otherwise watch the From value
 * vanish from a required field on open. Mobile does the same with its `preset`
 * insert.
 */
export function withCurrentAssignment(
  targets: readonly Target[],
  current: Target | null,
): Target[] {
  if (!current) return [...targets];
  const key = targetKey(current);
  return targets.some((target) => targetKey(target) === key) ? [...targets] : [current, ...targets];
}

// ── Reason and transport ────────────────────────────────────────────────────

export const REASON_OPTIONS: readonly { value: ReasonEnum; label: string }[] = [
  { value: ReasonEnum.surgery, label: 'Surgery' },
  { value: ReasonEnum.restock, label: 'Restock' },
  { value: ReasonEnum.return, label: 'Return' },
  { value: ReasonEnum.other, label: 'Other' },
];

/**
 * Three of the enum's four.
 *
 * `other` is deliberately absent: mobile does not surface it and neither
 * prototype offers it, so there is no copy for what it would mean or which
 * photos it would require.
 */
export const TRANSPORT_OPTIONS: readonly { value: TransportMethodEnum; label: string }[] = [
  { value: TransportMethodEnum.rep, label: 'Rep Transport' },
  { value: TransportMethodEnum.fedex, label: 'FedEx' },
  { value: TransportMethodEnum.ups, label: 'UPS' },
];

/** Carriers need the shipping label photographed; a rep hand-carries. */
export function requiresLabelPhoto(method: TransportMethodEnum | null): boolean {
  return method === TransportMethodEnum.fedex || method === TransportMethodEnum.ups;
}

export function transportLabel(method: TransportMethodEnum | null): string {
  return TRANSPORT_OPTIONS.find((option) => option.value === method)?.label ?? '';
}

// ── Photos ──────────────────────────────────────────────────────────────────

export interface StagedFile {
  file: File;
  previewUrl: string;
}

/**
 * A single replaceable file, not the Update Status strip.
 *
 * Returns the object URL the caller must revoke rather than revoking it here,
 * so this module stays DOM-free — same contract as `removeTile` there.
 */
export function replaceFile(
  current: StagedFile | null,
  next: StagedFile | null,
): { value: StagedFile | null; revoke: string | null } {
  return { value: next, revoke: current?.previewUrl ?? null };
}

// ── Form ────────────────────────────────────────────────────────────────────

export interface TransferFormValues {
  fromKey: string | null;
  toKey: string | null;
  reason: ReasonEnum;
  transferDate: string;
  transport: TransportMethodEnum | null;
  kitPhoto: StagedFile | null;
  labelPhoto: StagedFile | null;
  notes: string;
}

/** `YYYY-MM-DD` for a local calendar day — never `toISOString`, which is UTC. */
export function toDateInput(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The inverse, for seeding the calendar's selection.
 *
 * Built from parts rather than `new Date('2026-04-22')`, which parses as UTC
 * midnight and lands on the 21st anywhere west of Greenwich — the same trap
 * `lib/dates.ts` documents for rendering.
 */
export function fromDateInput(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function seedTransferForm(kit: InventoryKitDetail, today = new Date()): TransferFormValues {
  const current = currentAssignment(kit);
  return {
    fromKey: current ? targetKey(current) : null,
    toKey: null,
    reason: ReasonEnum.surgery,
    transferDate: toDateInput(today),
    transport: null,
    kitPhoto: null,
    labelPhoto: null,
    notes: '',
  };
}

/**
 * Expand a target into the one `*_assigned_to_*` column it writes.
 *
 * The other two columns are left absent rather than sent as null: the server
 * defaults the source org when neither side names one, and an explicit null
 * would be a value the picker never expressed.
 */
const TARGET_COLUMNS: Record<TargetType, string> = {
  [TransferTargetTypeEnum.representative]: 'assigned_to_representative',
  [TransferTargetTypeEnum.facility]: 'assigned_to_facility',
  [ORGANIZATION]: 'assigned_to_parent_company',
};

function sideFields(
  side: 'from' | 'to',
  target: Target | null,
): Partial<InventoryTransferDetailRequest> {
  if (!target) return {};
  return { [`${side}_${TARGET_COLUMNS[target.type]}`]: target.id };
}

export function buildTransferBody(
  kit: InventoryKitDetail,
  values: TransferFormValues,
  targets: readonly Target[],
): InventoryTransferDetailRequest {
  const notes = values.notes.trim();
  return {
    // An array of exactly one. Bulk transfer is a later *caller* of this
    // builder, not a rewrite of it — the endpoint has always taken a set.
    //
    // `inventory_kits` is the deprecated alias of this field and is never sent:
    // both write the same source, and sending both with different values is a
    // 400. Mobile still sends the old spelling.
    stock_items: [kit.id],
    reason: values.reason,
    // Non-null by the time this runs; validation gates the save.
    transport_method: values.transport ?? TransportMethodEnum.rep,
    transfer_date: values.transferDate,
    ...sideFields('from', findTarget(targets, values.fromKey)),
    ...sideFields('to', findTarget(targets, values.toKey)),
    // Omitted when blank: this is a create, so there is nothing to clear, and
    // an explicit null would be a value nobody typed.
    ...(notes ? { notes } : {}),
    ...(values.kitPhoto ? { kit_photo: values.kitPhoto.file } : {}),
    // Dropped for a method that does not want it, even if one was staged before
    // the method changed. `clearLabelPhotoFor` normally prevents that; this is
    // the belt to its braces, because a stale file here is silent.
    ...(requiresLabelPhoto(values.transport) && values.labelPhoto
      ? { label_photo: values.labelPhoto.file }
      : {}),
    // `is_draft` is writable on this serializer and is never sent: a draft
    // transfer is hidden from admin views, which is not what this dialog makes.
  };
}

// ── Validation ──────────────────────────────────────────────────────────────

export interface TransferFormErrors {
  from?: string;
  to?: string;
  reason?: string;
  transferDate?: string;
  transport?: string;
  photos?: string;
}

/** The client-side rules. The server requires neither photo. */
export function validateTransferForm(values: TransferFormValues): TransferFormErrors {
  const errors: TransferFormErrors = {};

  if (!values.fromKey) errors.from = 'Select where the kit is transferring from';
  if (!values.toKey) errors.to = 'Please select where to transfer to';
  if (!values.transferDate) errors.transferDate = 'Select a transfer date';
  if (!values.transport) {
    errors.transport = 'Please select a transport method';
  } else if (!values.kitPhoto) {
    errors.photos = 'A kit photo is required';
  } else if (requiresLabelPhoto(values.transport) && !values.labelPhoto) {
    errors.photos = 'A shipping label photo is required';
  }

  return errors;
}

export function hasTransferErrors(errors: TransferFormErrors): boolean {
  return Object.values(errors).some(Boolean);
}

/**
 * Which form slot each field the server rejected belongs under.
 *
 * `inventory_kits` is here beside `stock_items` because the serializer reports
 * the missing-stock error under *both* names by design, so a client on either
 * spelling sees it. This one sends `stock_items`, but a message arriving under
 * the alias must still land somewhere rather than vanishing.
 */
const FIELD_SLOTS: Record<string, keyof TransferFormErrors> = {
  stock_items: 'to',
  inventory_kits: 'to',
  from_assigned_to_parent_company: 'from',
  from_assigned_to_representative: 'from',
  from_assigned_to_facility: 'from',
  to_assigned_to_parent_company: 'to',
  to_assigned_to_representative: 'to',
  to_assigned_to_facility: 'to',
  reason: 'reason',
  transfer_date: 'transferDate',
  transport_method: 'transport',
  kit_photo: 'photos',
  label_photo: 'photos',
};

export function transferFieldErrors(error: unknown): TransferFormErrors {
  const fields = asFieldErrors(error);
  if (!fields) return {};

  const errors: TransferFormErrors = {};
  for (const [field, messages] of Object.entries(fields)) {
    const slot = FIELD_SLOTS[field];
    const message = messages[0];
    if (!slot || !message) continue;
    // Both alias spellings map to one slot, so a dual-reported error would
    // otherwise print twice.
    if (errors[slot] === message) continue;
    errors[slot] = errors[slot] ? `${errors[slot]} ${message}` : message;
  }
  return errors;
}

/** The form-level alert: what the server said, else the house generic copy. */
export function transferErrorMessage(error: unknown): string {
  for (const [field, messages] of Object.entries(asFieldErrors(error) ?? {})) {
    const first = messages[0];
    if (!FIELD_SLOTS[field] && first) return first;
  }
  return errorMessage(error);
}
