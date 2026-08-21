import { asFieldErrors, errorMessage } from '@/api/errors';
import type {
  HanselCredential,
  HanselCredentialRequest,
  PatchedHanselCredentialRequest,
  WebOrganization,
  WebUser,
} from '@/api/generated/model';

/**
 * Everything the Credentials form decides, with no DOM in sight.
 *
 * The split follows `receive-sku.ts`: values, validation, the two request
 * bodies and the server-error mapping live here and are unit-tested directly,
 * while `components/hansel-credential-form.tsx` is left holding only markup and
 * state. The two request bodies are the reason it earns its own module —
 * `buildCredentialPatch` omitting a key is invisible in a component test and
 * silently destroys a working secret if it ever stops doing so.
 */

export type CredentialFormMode = 'create' | 'edit';

export interface HanselCredentialValues {
  /** A string because that is what a `Select` and an `Input` both hand back. */
  organizationId: string;
  clientId: string;
  clientSecret: string;
  workspaceId: string;
  isActive: boolean;
  syncEnabled: boolean;
  /** Empty means unset. Nullability is reintroduced at the request boundary. */
  defaultAssetTypeId: string;
  defaultManufacturerId: string;
}

export interface HanselCredentialErrors {
  organization?: string;
  clientId?: string;
  clientSecret?: string;
  workspaceId?: string;
  defaultAssetTypeId?: string;
  defaultManufacturerId?: string;
}

/** The server's own floor: `client_secret` is `min_length=8`. */
const MIN_SECRET_LENGTH = 8;

/** The server's own ceiling: `client_id` is `max_length=255`. */
const MAX_CLIENT_ID_LENGTH = 255;

export function initialCredentialValues(
  organizationId: number | null,
  credential?: HanselCredential,
): HanselCredentialValues {
  return {
    organizationId: String(credential?.parent_company ?? organizationId ?? ''),
    clientId: credential?.client_id ?? '',
    // Never seeded. The secret is write-only and the server has never sent it;
    // a placeholder here would be a value the user could accidentally submit.
    clientSecret: '',
    workspaceId: credential?.workspace_id ?? '',
    isActive: credential?.is_active ?? true,
    // `?? false` matches the server's own default: sync is off until an admin
    // deliberately turns it on, which is what keeps the feature dark for the
    // organizations — nearly all of them — that will never use it.
    syncEnabled: credential?.sync_enabled ?? false,
    defaultAssetTypeId: credential?.default_asset_type_id ?? '',
    defaultManufacturerId: credential?.default_manufacturer_id ?? '',
  };
}

/**
 * Whether a string is something Python's `uuid.UUID()` would accept.
 *
 * Deliberately as permissive as the server rather than as strict as the
 * canonical form: DRF's `UUIDField` parses the bare 32-hex spelling, the
 * braced one and the `urn:uuid:` one as readily as the dashed one, and a
 * client-side pattern that rejected a spelling Hansel actually issues would
 * block a save the server would have accepted.
 */
export function normaliseUuid(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^urn:uuid:/, '')
    .replace(/^\{|\}$/g, '')
    .replaceAll('-', '');
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{32}$/.test(normaliseUuid(value));
}

/**
 * The client-side checks, run on every keystroke and shown once submitted.
 *
 * `mode` is the whole reason this is not a constant schema: on edit, a blank
 * secret is not a missing value but an instruction — keep the stored one. The
 * same blank on create is the one field the server cannot supply for itself.
 *
 * `takenWorkspaceIds` is the duplicate check, and it is here rather than left to
 * the server because of what the server actually says. DRF derives a
 * `UniqueTogetherValidator` from the model's partial constraint and rejects with
 * its own default wording — *"The fields parent_company, workspace_id must make
 * a unique set."* — naming database columns at a customer. The viewset's much
 * better sentence is only reachable on the concurrent-create race the validator
 * misses. Catching it here trades a round trip for copy the user can act on,
 * and the server's message stays as the fallback for that race.
 */
export function validateHanselCredential(
  values: HanselCredentialValues,
  mode: CredentialFormMode,
  takenWorkspaceIds: string[] = [],
): HanselCredentialErrors {
  const errors: HanselCredentialErrors = {};

  if (!values.organizationId.trim()) {
    errors.organization = 'Choose the organization these credentials belong to';
  }

  const clientId = values.clientId.trim();
  if (!clientId) {
    errors.clientId = 'Enter the client ID from your Hansel account';
  } else if (clientId.length > MAX_CLIENT_ID_LENGTH) {
    errors.clientId = `Client ID cannot be longer than ${MAX_CLIENT_ID_LENGTH} characters`;
  }

  const secret = values.clientSecret.trim();
  if (mode === 'create' && !secret) {
    errors.clientSecret = 'Enter the client secret from your Hansel account';
  } else if (secret && secret.length < MIN_SECRET_LENGTH) {
    errors.clientSecret = `Client secret must be at least ${MIN_SECRET_LENGTH} characters`;
  }

  const workspace = values.workspaceId.trim();
  if (!workspace) {
    errors.workspaceId = 'Enter the workspace ID from your Hansel account';
  } else if (!isUuid(workspace)) {
    errors.workspaceId =
      'That does not look like a workspace UUID — copy it from your Hansel account';
  } else if (takenWorkspaceIds.some((taken) => normaliseUuid(taken) === normaliseUuid(workspace))) {
    errors.workspaceId =
      'This organization already has credentials for that Hansel workspace. Edit those instead.';
  }

  const assetType = values.defaultAssetTypeId.trim();
  const manufacturer = values.defaultManufacturerId.trim();

  if (assetType && !isUuid(assetType)) {
    errors.defaultAssetTypeId =
      'That does not look like an asset type UUID — copy it from your Hansel account';
  } else if (values.syncEnabled && !assetType) {
    // The server's own rule, checked here for the same reason the duplicate
    // workspace is: Hansel demands a device type on every asset it creates and
    // we have nothing local to derive one from, so enabling sync without it
    // fails on every single attach — as a code on a tracker nobody is looking
    // at. The round trip would answer this correctly; answering before it is
    // what puts the message where the user is already looking.
    errors.defaultAssetTypeId = 'Set an asset type before turning sync on — Hansel requires one';
  }

  if (manufacturer && !isUuid(manufacturer)) {
    errors.defaultManufacturerId =
      'That does not look like a manufacturer UUID — copy it from your Hansel account';
  }

  return errors;
}

export function hasCredentialErrors(errors: HanselCredentialErrors): boolean {
  return Object.values(errors).some(Boolean);
}

export function buildCredentialCreateBody(values: HanselCredentialValues): HanselCredentialRequest {
  return {
    parent_company: Number(values.organizationId),
    client_id: values.clientId.trim(),
    workspace_id: values.workspaceId.trim(),
    client_secret: values.clientSecret.trim(),
    is_active: values.isActive,
    sync_enabled: values.syncEnabled,
    ...syncTargets(values),
  };
}

/**
 * The two sync UUIDs, as the server wants them: a value, or an explicit `null`.
 *
 * `null` rather than `''` and rather than omission, and the three are not
 * interchangeable. The columns are nullable, so `''` would store an empty
 * string that reads as configured and resolves to nothing — while *omitting*
 * the key on a PATCH means "leave what is stored", which makes clearing a value
 * impossible. Only an explicit null empties one.
 */
function syncTargets(values: HanselCredentialValues) {
  return {
    default_asset_type_id: values.defaultAssetTypeId.trim() || null,
    default_manufacturer_id: values.defaultManufacturerId.trim() || null,
  };
}

/**
 * The edit body, and the two omissions that make it correct.
 *
 * **`client_secret` is absent, not empty, when the field is blank.** The server
 * reads an absent key as "keep the stored secret" and a present one as "replace
 * it" — so sending `''` would swap a working credential for one that cannot
 * authenticate, and the only sign would be the next verify failing.
 *
 * **`parent_company` is never sent at all.** The serializer rejects any PATCH
 * that names a different organization, and there is no version of this form
 * that wants to move one — so leaving the key out makes that 400 unreachable by
 * construction rather than by the form remembering not to.
 */
export function buildCredentialPatch(
  values: HanselCredentialValues,
): PatchedHanselCredentialRequest {
  const secret = values.clientSecret.trim();
  return {
    client_id: values.clientId.trim(),
    workspace_id: values.workspaceId.trim(),
    is_active: values.isActive,
    sync_enabled: values.syncEnabled,
    ...syncTargets(values),
    ...(secret ? { client_secret: secret } : {}),
  };
}

/**
 * Which form control owns each field the server can reject.
 *
 * `parent_company` is deliberately absent. Its two messages — "your account is
 * not linked to an organization" and "credentials cannot be moved between
 * organizations" — are about the account, not about a value the user picked,
 * and the control they would attach to is not even rendered for the
 * single-organization user who is most likely to see the first one. Both land
 * in the form-level message instead, which is always on screen.
 */
const FIELD_SLOTS: Record<string, keyof HanselCredentialErrors> = {
  client_id: 'clientId',
  client_secret: 'clientSecret',
  workspace_id: 'workspaceId',
  default_asset_type_id: 'defaultAssetTypeId',
  default_manufacturer_id: 'defaultManufacturerId',
};

/** Server rejections, folded onto the form's own error slots. */
export function credentialFieldErrors(error: unknown): HanselCredentialErrors {
  const fields = asFieldErrors(error);
  if (!fields) return {};

  const errors: HanselCredentialErrors = {};
  for (const [field, messages] of Object.entries(fields)) {
    const slot = FIELD_SLOTS[field];
    const first = messages[0];
    if (!slot || !first) continue;
    errors[slot] = errors[slot] ? `${errors[slot]} ${first}` : first;
  }
  return errors;
}

/**
 * What the server said that no field could show — or null when it all fitted.
 *
 * The case that matters is `non_field_errors`: DRF derives a
 * `UniqueTogetherValidator` from the model's partial constraint, so re-adding a
 * workspace an organization already has reports there, with a sentence that
 * already says what to do instead ("Update them instead") — which is why it is
 * surfaced verbatim rather than replaced.
 *
 * Null when every message already has a slot, unlike the inventory forms this
 * otherwise copies. Printing "Something went wrong. Please try again." above
 * three specific, correct field errors tells the user less than the fields
 * already did, and invites them to retry an input the server has just explained
 * is wrong. Anything that is *not* a field map — a 503, a gateway, an offline
 * browser — has no field to land in and still comes through here.
 */
export function credentialSaveErrorMessage(error: unknown): string | null {
  const fields = asFieldErrors(error);
  if (!fields) return errorMessage(error);

  for (const [field, messages] of Object.entries(fields)) {
    const first = messages[0];
    if (!FIELD_SLOTS[field] && first) return first;
  }
  return null;
}

/**
 * Which organization a new credential is filed under.
 *
 * The API needs a `parent_company` and the app already knows the answer — the
 * login response carries the user's memberships — so this asks nobody anything
 * it can work out for itself, and asks explicitly when it genuinely cannot.
 */
export type OrganizationChoice =
  | { kind: 'single'; id: number; name: string }
  | { kind: 'choose'; options: WebOrganization[]; defaultId: number }
  | { kind: 'none' };

export function resolveOrganization(user: WebUser | null): OrganizationChoice {
  // `?? []` rather than trusting the type: `readCachedUser()` JSON.parses
  // whatever localStorage holds, which a build predating `organizations` wrote
  // without it.
  const organizations = user?.organizations ?? [];
  if (organizations.length === 0) return { kind: 'none' };

  const [only] = organizations;
  if (organizations.length === 1 && only) {
    return { kind: 'single', id: only.id, name: only.name };
  }

  const primary = organizations.find((organization) => organization.is_primary);
  return {
    kind: 'choose',
    options: organizations,
    defaultId: (primary ?? organizations[0])!.id,
  };
}
