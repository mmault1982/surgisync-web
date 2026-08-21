import { useMutation, useQueryClient } from '@tanstack/react-query';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { useState } from 'react';

import {
  hanselCredentialCreate,
  hanselCredentialPartialUpdate,
} from '@/api/generated/endpoints/integrations/integrations';
import type { HanselCredential } from '@/api/generated/model';
import { Field } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { hanselCredentialKeys } from '../hansel.keys';
import {
  buildCredentialCreateBody,
  buildCredentialPatch,
  credentialFieldErrors,
  credentialSaveErrorMessage,
  hasCredentialErrors,
  initialCredentialValues,
  validateHanselCredential,
  type CredentialFormMode,
  type HanselCredentialErrors,
  type HanselCredentialValues,
  type OrganizationChoice,
} from '../hansel-credentials';

/**
 * The three values Hansel issues, plus the two the API needs around them.
 *
 * One component for create and edit. They differ in exactly three places — the
 * organization control, whether the secret is required, and the request — and
 * two near-identical forms is how the required-marker on one of them goes stale.
 *
 * Inline rather than a `Dialog`, unlike Kit Detail's four. The split is what the
 * form is *for*: those act on a record you are looking at, so a modal over it is
 * right; this edits the page's own content, where a focus trap stops the user
 * comparing what they are typing against the row above it.
 *
 * State is `useState` plus the pure validator in `hansel-credentials.ts`, the
 * idiom every form here but `login-form.tsx` uses.
 */
export function HanselCredentialForm({
  mode,
  credential,
  organization,
  takenWorkspaceIds = [],
  onCancel,
  onSaved,
}: {
  mode: CredentialFormMode;
  credential?: HanselCredential;
  organization: OrganizationChoice;
  /**
   * Workspaces this organization already holds, so the duplicate is caught
   * before the round trip that would answer it in DRF's column-naming default.
   * Excludes this credential's own workspace when editing — see the section.
   */
  takenWorkspaceIds?: string[];
  /** Absent in the empty state, where there is nothing to go back to. */
  onCancel?: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<HanselCredentialValues>(() =>
    initialCredentialValues(
      organization.kind === 'none' ? null : defaultOrgId(organization),
      credential,
    ),
  );
  const [submitted, setSubmitted] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const save = useMutation({
    // A rejected credential is a decision for the user, not something to re-send
    // — and a create that half-succeeded would leave a duplicate behind.
    retry: false,
    mutationFn: () =>
      credential
        ? hanselCredentialPartialUpdate(credential.id, buildCredentialPatch(values))
        : hanselCredentialCreate(buildCredentialCreateBody(values)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: hanselCredentialKeys.all });
      onSaved();
    },
  });

  const clientErrors = validateHanselCredential(values, mode, takenWorkspaceIds);
  const serverErrors = credentialFieldErrors(save.error);
  // The server wins the slot: its message is about the value it actually saw.
  const shown: HanselCredentialErrors = submitted
    ? { ...clientErrors, ...serverErrors }
    : serverErrors;
  const formError = save.isError ? credentialSaveErrorMessage(save.error) : null;

  const disabled = save.isPending;

  function update<K extends keyof HanselCredentialValues>(
    field: K,
    value: HanselCredentialValues[K],
  ) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (hasCredentialErrors(clientErrors)) return;
    save.mutate();
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {organization.kind === 'none' ? (
        <p role="alert" className="text-sm text-destructive">
          Your account is not linked to an organization, so Hansel credentials cannot be stored. Ask
          an administrator to add you to one.
        </p>
      ) : null}

      {mode === 'create' && organization.kind === 'single' ? (
        <p className="text-sm text-muted-foreground">
          Filed under <span className="font-medium text-foreground">{organization.name}</span>.
        </p>
      ) : null}

      {mode === 'create' && organization.kind === 'choose' ? (
        <Field
          label="Organization"
          required
          htmlFor="hansel-organization"
          error={shown.organization}
        >
          <Select
            value={values.organizationId}
            onValueChange={(value) => update('organizationId', value)}
            disabled={disabled}
          >
            <SelectTrigger id="hansel-organization" className="w-full">
              <SelectValue placeholder="Choose an organization" />
            </SelectTrigger>
            <SelectContent>
              {organization.options.map((option) => (
                <SelectItem key={option.id} value={String(option.id)}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}

      {mode === 'edit' ? (
        // Read-only, not a disabled control: the server refuses to move
        // credentials between organizations, so there is no version of this
        // field the user could usefully interact with.
        <p className="text-sm text-muted-foreground">
          Filed under{' '}
          <span className="font-medium text-foreground">
            {credential?.parent_company_name ?? 'this organization'}
          </span>
          .
        </p>
      ) : null}

      <Field label="Client ID" required htmlFor="hansel-client-id" error={shown.clientId}>
        <Input
          id="hansel-client-id"
          value={values.clientId}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          aria-invalid={Boolean(shown.clientId)}
          onChange={(event) => update('clientId', event.target.value)}
        />
      </Field>

      <Field
        label="Client Secret"
        required={mode === 'create'}
        htmlFor="hansel-client-secret"
        hint={mode === 'edit' ? ' — leave blank to keep the stored secret' : undefined}
        error={shown.clientSecret}
      >
        <div className="relative">
          <Input
            id="hansel-client-secret"
            // `new-password` rather than `off`: Chrome ignores `off` on a
            // password field and offers a saved credential for this site, which
            // is a different secret entirely.
            autoComplete="new-password"
            type={revealed ? 'text' : 'password'}
            value={values.clientSecret}
            placeholder={
              mode === 'edit' && credential?.client_secret_last4
                ? `•••• ${credential.client_secret_last4}`
                : undefined
            }
            disabled={disabled}
            aria-invalid={Boolean(shown.clientSecret)}
            className="pr-10"
            onChange={(event) => update('clientSecret', event.target.value)}
          />
          <button
            type="button"
            aria-label={revealed ? 'Hide secret' : 'Show secret'}
            aria-pressed={revealed}
            onClick={() => setRevealed((visible) => !visible)}
            className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {revealed ? (
              <EyeOffIcon aria-hidden className="size-4" />
            ) : (
              <EyeIcon aria-hidden className="size-4" />
            )}
          </button>
        </div>
      </Field>

      {mode === 'edit' ? (
        // Said before it happens, not discovered after. Supplying a secret
        // clears `last_verified_at` server-side, so a user who came here to fix
        // a client-ID typo would otherwise watch the Verified badge vanish.
        <p className="-mt-2 text-xs text-muted-foreground">
          Entering a new secret also clears the last check result.
        </p>
      ) : null}

      <Field label="Workspace ID" required htmlFor="hansel-workspace-id" error={shown.workspaceId}>
        <Input
          id="hansel-workspace-id"
          value={values.workspaceId}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          aria-invalid={Boolean(shown.workspaceId)}
          className="font-mono"
          onChange={(event) => update('workspaceId', event.target.value)}
        />
      </Field>

      <div className="flex items-center gap-2">
        <Checkbox
          id="hansel-active"
          checked={values.isActive}
          disabled={disabled}
          onCheckedChange={(checked) => update('isActive', checked === true)}
        />
        <Label htmlFor="hansel-active" className="font-normal">
          Active
        </Label>
      </div>

      {/*
        Grouped and separated rather than appended in schema order, because the
        three are one feature and depend on each other — the checkbox is invalid
        without the asset type, which is a relationship a flat list of controls
        does not convey.
      */}
      <div className="flex flex-col gap-4 border-t border-border pt-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Asset sync</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            When on, attaching a beacon to a stock item creates the matching asset in Hansel and
            assigns the tag to it.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="hansel-sync-enabled"
            checked={values.syncEnabled}
            disabled={disabled}
            onCheckedChange={(checked) => update('syncEnabled', checked === true)}
          />
          <Label htmlFor="hansel-sync-enabled" className="font-normal">
            Sync stock items to Hansel
          </Label>
        </div>

        <Field
          label="Asset type ID"
          hint={values.syncEnabled ? ' — required to sync' : ' (optional)'}
          htmlFor="hansel-asset-type-id"
          error={shown.defaultAssetTypeId}
        >
          <Input
            id="hansel-asset-type-id"
            value={values.defaultAssetTypeId}
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            aria-invalid={Boolean(shown.defaultAssetTypeId)}
            className="font-mono"
            onChange={(event) => update('defaultAssetTypeId', event.target.value)}
          />
          {/*
            Nothing else in the product tells you where this comes from, and it
            cannot be derived from anything we hold — without this line the
            field is unfillable in practice.
          */}
          <p className="mt-1 text-xs text-muted-foreground">
            The Hansel device type applied to every asset we create. List them in Hansel with{' '}
            <code className="font-mono">GET /api/v1/assets/types</code>.
          </p>
        </Field>

        <Field
          label="Manufacturer ID"
          hint=" (optional)"
          htmlFor="hansel-manufacturer-id"
          error={shown.defaultManufacturerId}
        >
          <Input
            id="hansel-manufacturer-id"
            value={values.defaultManufacturerId}
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            aria-invalid={Boolean(shown.defaultManufacturerId)}
            className="font-mono"
            onChange={(event) => update('defaultManufacturerId', event.target.value)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Used when a part&rsquo;s manufacturer has no explicit Hansel mapping. Leave blank if
            every manufacturer is mapped.
          </p>
        </Field>
      </div>

      {formError ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={disabled}>
          {disabled ? (
            <span
              className="size-5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
              role="status"
              aria-label="Saving"
            />
          ) : mode === 'create' ? (
            'Save credentials'
          ) : (
            'Save changes'
          )}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" disabled={disabled} onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function defaultOrgId(organization: OrganizationChoice): number | null {
  if (organization.kind === 'single') return organization.id;
  if (organization.kind === 'choose') return organization.defaultId;
  return null;
}
