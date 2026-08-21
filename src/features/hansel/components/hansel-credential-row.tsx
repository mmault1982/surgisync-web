import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { errorMessage } from '@/api/errors';
import { hanselCredentialVerify } from '@/api/generated/endpoints/integrations/integrations';
import type { HanselCredential } from '@/api/generated/model';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { hanselCredentialKeys } from '../hansel.keys';
import {
  credentialBadges,
  lastCheckedLabel,
  maskedSecret,
  readVerifyResult,
  verificationMessage,
  type BadgeTone,
  type VerifyOutcome,
} from '../hansel-status';

const BADGE_TONES: Record<BadgeTone, string> = {
  ok: 'bg-success-container text-success-foreground',
  warning: 'bg-warning-container text-warning-foreground',
  bad: '',
  muted: '',
};

const BADGE_VARIANTS: Record<BadgeTone, 'secondary' | 'destructive'> = {
  ok: 'secondary',
  warning: 'secondary',
  bad: 'destructive',
  muted: 'secondary',
};

/**
 * One configured workspace: what is stored, what state it is in, and the three
 * things you can do to it.
 *
 * Three visible buttons rather than a `DropdownMenu`. This is a short list on a
 * settings page, not a dense table — the menu would hide three commands behind
 * a click each to save space the page has plenty of.
 */
export function HanselCredentialRow({
  credential,
  showOrganization,
  onEdit,
  onDelete,
}: {
  credential: HanselCredential;
  showOrganization: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const queryClient = useQueryClient();
  const [outcome, setOutcome] = useState<VerifyOutcome | null>(null);

  const verify = useMutation({
    retry: false,
    mutationFn: () => hanselCredentialVerify(credential.id),
    onSuccess: (result) => {
      // **200 is not "the credentials work".** The endpoint answers 200 with
      // `ok: false` when Hansel rejects them, because the request succeeded and
      // the credentials did not. `readVerifyResult` is what keeps that
      // distinction from collapsing into a green tick.
      setOutcome(readVerifyResult(result));
      // The server has just written last_verified_at / last_verification_error,
      // so refetch or the badges contradict the message directly below them.
      void queryClient.invalidateQueries({ queryKey: hanselCredentialKeys.all });
    },
  });

  const storedFailure = credential.last_verification_error
    ? (verificationMessage(credential.last_verification_error) ??
      credential.last_verification_error)
    : null;

  /** Whether this row is showing the result of a check run just now. */
  const live = outcome !== null || verify.error !== null;

  return (
    <li className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Workspace
          </p>
          <p className="mt-0.5 font-mono text-sm break-all text-foreground">
            {credential.workspace_id}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {credentialBadges(credential).map((badge) => (
            <Badge
              key={badge.label}
              variant={BADGE_VARIANTS[badge.tone]}
              className={cn(BADGE_TONES[badge.tone])}
            >
              {badge.label}
            </Badge>
          ))}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-4 @sm:grid-cols-2">
        <Detail label="Client ID" value={credential.client_id} mono />
        <Detail label="Client secret" value={maskedSecret(credential)} mono />
        {showOrganization ? (
          <Detail label="Organization" value={credential.parent_company_name ?? '—'} />
        ) : null}
        {/*
          `last_verified_at` is the last *successful* exchange — the server
          leaves it alone when a check fails — so this is "Last verified", not
          "Last checked". Labelled as the latter it reads "Never" in the same
          breath as a check the user just watched run.
        */}
        <Detail label="Last verified" value={lastCheckedLabel(credential)} />
        {/*
          Shown whether or not sync is on, and `||` rather than `??` because the
          server can answer either null or an empty string. A missing asset type
          is the single thing that blocks turning sync on, so an em-dash here is
          the answer to "why can I not enable this?" — which hiding the row
          until sync was already enabled would make unanswerable.
        */}
        <Detail label="Asset type" value={credential.default_asset_type_id || '—'} mono />
        <Detail label="Manufacturer" value={credential.default_manufacturer_id || '—'} mono />
      </dl>

      {!credential.secret_readable ? (
        // Not a check result: the ciphertext cannot be read at all, whatever
        // the last check said. It stays put while a live result comes and goes.
        <p className="mt-3 text-sm text-destructive">
          The stored secret was encrypted on a different server and cannot be read here. Re-enter
          the client secret.
        </p>
      ) : storedFailure && !live ? (
        // Only until a live result supersedes it. Both are rendered from the
        // same copy map, and the invalidation after a check makes the stored
        // one say exactly what the live one just said — so without this the
        // row prints the same sentence twice.
        <p className="mt-3 text-sm text-destructive">{storedFailure}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={verify.isPending}
          onClick={() => verify.mutate()}
        >
          {verify.isPending ? (
            <span
              className="size-4 animate-spin rounded-full border-2 border-muted-foreground/40 border-t-foreground"
              role="status"
              aria-label="Checking"
            />
          ) : (
            'Test connection'
          )}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          Remove
        </Button>
      </div>

      <VerifyResult outcome={outcome} error={verify.error} />
    </li>
  );
}

/**
 * The check's answer, in a live region.
 *
 * `role="status"` is right here and wrong on the row's other notices: this is
 * the result of a button the user just pressed and nothing moves focus, so
 * without it a screen-reader user is told nothing happened. The stored-state
 * lines above are present at load, which is the case `kit-detail-banners.tsx`
 * documents as the one that must *not* be a live region.
 */
function VerifyResult({ outcome, error }: { outcome: VerifyOutcome | null; error: unknown }) {
  if (error) {
    return (
      <p role="alert" className="mt-3 text-sm text-destructive">
        {errorMessage(error)}
      </p>
    );
  }
  if (!outcome) return null;

  if (outcome.kind === 'ok') {
    const minutes = outcome.expiresIn === null ? null : Math.round(outcome.expiresIn / 60);
    return (
      <p
        role="status"
        className="mt-3 rounded-lg bg-success-container p-3 text-sm text-success-foreground"
      >
        Hansel accepted these credentials.
        {minutes === null ? '' : ` The token it issued lasts ${minutes} minutes.`}
      </p>
    );
  }

  return (
    <p role="status" className="mt-3 text-sm text-destructive">
      {outcome.message}
    </p>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className={cn('mt-0.5 text-sm break-all text-foreground', mono && 'font-mono')}>
        {value}
      </dd>
    </div>
  );
}
