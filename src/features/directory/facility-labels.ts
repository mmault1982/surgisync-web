import { AccreditationStatusEnum, FacilityTypeEnum } from '@/api/generated/model';

/**
 * The facility enums this app renders, with the labels the model itself
 * declares.
 *
 * Declared once because four places have to agree — the table, the detail
 * card, the form's selects and the list's filter dropdown — and a vocabulary
 * that drifts between them is the kind of bug nobody files.
 *
 * `onboarding_status` is deliberately absent, though the contract has it and
 * every row carries one: this app does not show it, filter on it or write it.
 * Its labels lived here until all three of those went away. Bringing it back
 * means a `Record<OnboardingStatusEnum, string>` beside these, in the model's
 * own wording — `pending_review` is "Pending Review".
 *
 * **Not derived from the enum values by title-casing.** `surgery_center` reads
 * "Ambulatory Surgery Center" on the server, and a client that invented
 * "Surgery Center" would be showing a different vocabulary from the admin.
 * `ADDRESS_KIND_LABELS` in `address-form.ts` carries the same note for the
 * same reason.
 *
 * `Record<Enum, string>` rather than a lookup with a fallback, so adding a
 * value backend-side fails `pnpm typecheck` here rather than rendering a raw
 * `not_applicable` at someone.
 */

export const FACILITY_TYPE_LABELS: Record<FacilityTypeEnum, string> = {
  [FacilityTypeEnum.hospital]: 'Hospital',
  [FacilityTypeEnum.surgery_center]: 'Ambulatory Surgery Center',
  [FacilityTypeEnum.clinic]: 'Clinic',
  [FacilityTypeEnum.physician_office]: 'Physician Office',
  [FacilityTypeEnum.other]: 'Other',
};

export const FACILITY_TYPES = Object.keys(FACILITY_TYPE_LABELS) as FacilityTypeEnum[];

export const ACCREDITATION_STATUS_LABELS: Record<AccreditationStatusEnum, string> = {
  [AccreditationStatusEnum.accredited]: 'Accredited',
  [AccreditationStatusEnum.provisional]: 'Provisional',
  [AccreditationStatusEnum.pending]: 'Pending',
  [AccreditationStatusEnum.expired]: 'Expired',
  [AccreditationStatusEnum.not_applicable]: 'Not Applicable',
};

export const ACCREDITATION_STATUSES = Object.keys(
  ACCREDITATION_STATUS_LABELS,
) as AccreditationStatusEnum[];
