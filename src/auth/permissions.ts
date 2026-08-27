/**
 * Who may change their organization's records.
 *
 * Lifted out of `features/directory/permissions.ts` when the Product Catalog
 * became the fourth screen to ask — the same move `field.tsx` and
 * `delete-dialog.tsx` each record making on their second caller. Nothing about
 * the rule was ever about the directory: it mirrors one backend permission
 * class, which every write in this app is gated by.
 */

/**
 * The roles the backend's `IsOrganizationAdmin` accepts.
 *
 * Mirrors `users/permissions.py`'s `ADMIN_ROLES`. Kept as a literal rather
 * than derived from the contract because `WebUser.role` is a bare string
 * there — the enum lives in Python, so this is the seam where it has to be
 * restated, and a drift shows up as a control that 403s.
 */
const ADMIN_ROLES = new Set(['entity_global_admin', 'admin']);

/**
 * Whether to offer the write controls at all.
 *
 * This is presentation, not security — the server gates every write and is the
 * only thing that decides. What it prevents is a rep filling in a form and
 * being told 403 on submit, which is the worst possible moment to learn the
 * action was never available.
 *
 * Conservative in one direction on purpose: `WebUser` carries no
 * `is_superuser`, and the server's check passes superusers regardless of role,
 * so a superuser whose profile role is not an admin one sees no controls and
 * could still write through the API. Hiding a control someone may use beats
 * showing one most people may not.
 */
export function canManageOrgRecords(role: string | null | undefined): boolean {
  return role !== null && role !== undefined && ADMIN_ROLES.has(role);
}
