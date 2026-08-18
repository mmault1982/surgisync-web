import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { errorMessage, isForbidden } from '@/api/errors';
import type { HanselCredential, WebUser } from '@/api/generated/model';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { hanselQueries } from '../hansel.queries';
import { resolveOrganization } from '../hansel-credentials';

import { DeleteCredentialDialog } from './delete-credential-dialog';
import { HanselCredentialForm } from './hansel-credential-form';
import { HanselCredentialRow } from './hansel-credential-row';

/** Which form, if any, is open. A row id, the new-credential form, or nothing. */
type Editing = number | 'new' | null;

/**
 * The Credentials section: what is configured, or the form to configure it.
 *
 * Owns its own query rather than reading one the route loaded, because the
 * answer it most often gets from a non-administrator is a 403 — an ordinary
 * state for this section, and no reason for the page around it to fail.
 */
export function HanselCredentialsSection({ user }: { user: WebUser }) {
  const credentials = useQuery(hanselQueries.credentials());
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<HanselCredential | null>(null);
  const [saved, setSaved] = useState(false);

  const organization = resolveOrganization(user);
  const rows = credentials.data ?? [];
  const forbidden = credentials.isError && isForbidden(credentials.error);

  /**
   * The workspaces a new credential may not reuse.
   *
   * Editing a row excludes its own workspace, or saving an unchanged form would
   * report the row as a duplicate of itself.
   */
  const takenWorkspaces = (exceptId?: number) =>
    rows.filter((row) => row.id !== exceptId).map((row) => row.workspace_id);

  function open(next: Editing) {
    setSaved(false);
    setEditing(next);
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle asChild>
          <h2>Credentials</h2>
        </CardTitle>
        <CardDescription>
          The client ID, secret and workspace ID from your Hansel account. The secret is encrypted
          before it is stored and is never sent back to this page.
        </CardDescription>
        {rows.length > 0 && editing === null ? (
          <CardAction>
            <Button type="button" variant="outline" size="sm" onClick={() => open('new')}>
              Add workspace
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>

      <CardContent>
        {credentials.isPending ? (
          <div className="flex flex-col gap-3" aria-busy>
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : forbidden ? (
          // A plain paragraph, not `role="alert"`: it is content present at
          // load, and an assertive live region would interrupt a screen reader
          // on every navigation here. See `kit-detail-banners.tsx`.
          <div className="py-2">
            <p className="text-sm font-medium text-foreground">
              Only organization administrators can manage Hansel credentials.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask an administrator if this connection needs to change.
            </p>
          </div>
        ) : credentials.isError ? (
          <div className="py-2">
            <p className="text-sm font-medium text-foreground">Could not load credentials</p>
            <p className="mt-1 text-sm text-muted-foreground">{errorMessage(credentials.error)}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void credentials.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              No Hansel workspace is connected yet. Enter the credentials from your Hansel account
              to connect one.
            </p>
            {/* No Cancel: there is nothing behind this form to go back to. */}
            <HanselCredentialForm
              mode="create"
              organization={organization}
              onSaved={() => setSaved(true)}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <ul aria-label="Hansel credentials" className="flex flex-col gap-3">
              {rows.map((credential) =>
                editing === credential.id ? (
                  <li key={credential.id} className="rounded-lg border border-border p-4">
                    <HanselCredentialForm
                      mode="edit"
                      credential={credential}
                      organization={organization}
                      takenWorkspaceIds={takenWorkspaces(credential.id)}
                      onCancel={() => setEditing(null)}
                      onSaved={() => {
                        setEditing(null);
                        setSaved(true);
                      }}
                    />
                  </li>
                ) : (
                  <HanselCredentialRow
                    key={credential.id}
                    credential={credential}
                    showOrganization={organization.kind === 'choose'}
                    onEdit={() => open(credential.id)}
                    onDelete={() => setDeleting(credential)}
                  />
                ),
              )}
            </ul>

            {editing === 'new' ? (
              <div className="rounded-lg border border-border p-4">
                <HanselCredentialForm
                  mode="create"
                  organization={organization}
                  takenWorkspaceIds={takenWorkspaces()}
                  onCancel={() => setEditing(null)}
                  onSaved={() => {
                    setEditing(null);
                    setSaved(true);
                  }}
                />
              </div>
            ) : null}
          </div>
        )}

        {/*
          The saved notice, and the reason it is a live region: an inline save
          keeps the user exactly where they were, with focus unmoved and nothing
          navigated to. Without `role="status"` the only feedback is a form
          quietly folding away.

          It stops short of auto-running the check. Verify is throttled at
          10/min per user, and spending one on the user's behalf makes the
          button they were about to press fail — so it says to press it instead.
        */}
        {saved ? (
          <p
            role="status"
            className="mt-4 rounded-lg bg-success-container p-3 text-sm text-success-foreground"
          >
            Credentials saved. Use Test connection to confirm Hansel accepts them.
          </p>
        ) : null}
      </CardContent>

      {deleting ? (
        <DeleteCredentialDialog credential={deleting} onClose={() => setDeleting(null)} />
      ) : null}
    </Card>
  );
}
