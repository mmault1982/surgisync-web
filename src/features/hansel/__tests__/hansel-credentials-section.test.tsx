import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { HanselCredential, WebUser } from '@/api/generated/model';
import { server } from '@/test/msw/server';

import { HanselCredentialsSection } from '../components/hansel-credentials-section';

import {
  credentialFixture,
  credentialPage,
  organizationFixture,
  userFixture,
} from './credential-fixture';

/**
 * The Credentials section.
 *
 * Four things here are load-bearing rather than incidental coverage: a 403 is
 * an ordinary answer and must read as one; an edit that leaves the secret blank
 * must send a PATCH with no `client_secret` key; a verify that fails still
 * arrives as HTTP 200; and a coded 503 must not tell the user to wait for a
 * deployment that is not happening.
 */

beforeAll(() => {
  // Radix's popper measures its trigger and calls pointer-capture methods on
  // open; jsdom implements neither. Needed by Select and AlertDialog.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

const LIST = '/api/v1/integrations/hansel-credentials/';
const ONE = '/api/v1/integrations/hansel-credentials/1/';
const WORKSPACE = '3f1c9e2a-5b6d-4f7a-8c9d-0e1f2a3b4c5d';
const ASSET_TYPE = 'c85ab63c-ebb4-4dac-a8e0-b10b1eca8ae6';

/** Bodies of every write that went out, in order. */
let sent: unknown[];

beforeEach(() => {
  sent = [];
});

function listReturns(credentials: HanselCredential[]) {
  server.use(http.get(LIST, () => HttpResponse.json(credentialPage(credentials))));
}

function renderSection(user: WebUser = userFixture()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={client}>
      <HanselCredentialsSection user={user} />
    </QueryClientProvider>,
  );

  return { client, user: userEvent.setup() };
}

async function fillNewCredential(actor: ReturnType<typeof userEvent.setup>) {
  await actor.type(await screen.findByLabelText(/client id/i), 'hansel-client-abc');
  await actor.type(screen.getByLabelText(/client secret/i), 'a-long-enough-secret');
  await actor.type(screen.getByLabelText(/workspace id/i), WORKSPACE);
}

function save() {
  return screen.getByRole('button', { name: /save credentials/i });
}

describe('reading what is configured', () => {
  it('offers the form when no workspace is connected yet', async () => {
    listReturns([]);
    renderSection();

    expect(await screen.findByLabelText(/client id/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/client secret/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/workspace id/i)).toBeInTheDocument();
    // Nothing to add to and nothing to go back to.
    expect(screen.queryByRole('button', { name: /add workspace/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
  });

  it('shows the stored credential rather than a form', async () => {
    listReturns([credentialFixture()]);
    renderSection();

    expect(await screen.findByText(WORKSPACE)).toBeInTheDocument();
    expect(screen.getByText('•••• 9f2c')).toBeInTheDocument();
    expect(screen.getByText(/^Verified/)).toBeInTheDocument();
    // The secret field only exists once you ask to change it.
    expect(screen.queryByLabelText(/client secret/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add workspace/i })).toBeInTheDocument();
  });

  it('shows the sync targets whether or not they are set', async () => {
    // An em-dash rather than a hidden row: a missing asset type is the one
    // thing that blocks turning sync on, so this is the answer to "why can I
    // not enable this?".
    listReturns([credentialFixture()]);
    renderSection();

    expect(await screen.findByText('Asset type')).toBeInTheDocument();
    expect(screen.getByText('Manufacturer')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('Sync on')).not.toBeInTheDocument();
  });

  it('shows the sync badge and the stored targets once sync is on', async () => {
    listReturns([credentialFixture({ sync_enabled: true, default_asset_type_id: ASSET_TYPE })]);
    renderSection();

    expect(await screen.findByText('Sync on')).toBeInTheDocument();
    expect(screen.getByText(ASSET_TYPE)).toBeInTheDocument();
  });

  it('warns that a credential from another environment cannot be used', async () => {
    listReturns([credentialFixture({ secret_readable: false })]);
    renderSection();

    expect(await screen.findByText(/cannot be read here/i)).toBeInTheDocument();
    expect(screen.getByText('Secret unreadable')).toBeInTheDocument();
    // Even though last_verified_at is still set on the fixture.
    expect(screen.queryByText(/^Verified/)).not.toBeInTheDocument();
  });

  it('explains a 403 instead of reporting a failure', async () => {
    // Every endpoint here 403s for a signed-in user who is not an organization
    // administrator. That is the feature working, not breaking.
    server.use(
      http.get(LIST, () => HttpResponse.json({ detail: 'Not permitted.' }, { status: 403 })),
    );
    renderSection();

    expect(await screen.findByText(/only organization administrators/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/client id/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it('offers a retry when the list fails for some other reason', async () => {
    server.use(http.get(LIST, () => HttpResponse.json({}, { status: 500 })));
    renderSection();

    expect(await screen.findByText(/could not load credentials/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});

describe('connecting a workspace', () => {
  it('posts exactly the fields the endpoint declares', async () => {
    listReturns([]);
    server.use(
      http.post(LIST, async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json(credentialFixture(), { status: 201 });
      }),
    );
    const { user } = renderSection();

    await fillNewCredential(user);
    await user.click(save());

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      parent_company: 7,
      client_id: 'hansel-client-abc',
      workspace_id: WORKSPACE,
      client_secret: 'a-long-enough-secret',
      is_active: true,
      sync_enabled: false,
      default_asset_type_id: null,
      default_manufacturer_id: null,
    });
  });

  it('posts the sync settings when they are filled in', async () => {
    listReturns([]);
    server.use(
      http.post(LIST, async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json(credentialFixture(), { status: 201 });
      }),
    );
    const { user } = renderSection();

    await fillNewCredential(user);
    await user.type(screen.getByLabelText(/asset type id/i), ASSET_TYPE);
    await user.click(screen.getByLabelText(/sync stock items/i));
    await user.click(save());

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({
      sync_enabled: true,
      default_asset_type_id: ASSET_TYPE,
    });
  });

  it('refuses to enable sync without an asset type, without asking the server', async () => {
    listReturns([]);
    const { user } = renderSection();

    await fillNewCredential(user);
    await user.click(screen.getByLabelText(/sync stock items/i));
    await user.click(save());

    expect(
      await screen.findByText(/set an asset type before turning sync on/i),
    ).toBeInTheDocument();
    // No POST handler is registered, and MSW is set to error on an unhandled
    // request — so a request here would fail the test rather than pass silently.
    expect(sent).toHaveLength(0);
  });

  it('says to run the check rather than running it unasked', async () => {
    // Verify is throttled 10/min per user; spending one here makes the button
    // the user was about to press fail.
    listReturns([]);
    server.use(
      http.post(LIST, () => HttpResponse.json(credentialFixture(), { status: 201 })),
      http.post(`${ONE}verify/`, () => {
        sent.push('verified');
        return HttpResponse.json({
          ok: true,
          error: '',
          message: '',
          checked_at: 'x',
          expires_in: 1,
        });
      }),
    );
    const { user } = renderSection();

    await fillNewCredential(user);
    await user.click(save());

    expect(await screen.findByText(/use test connection to confirm/i)).toBeInTheDocument();
    expect(sent).not.toContain('verified');
  });

  it('will not submit a workspace id that is not a UUID', async () => {
    listReturns([]);
    server.use(
      http.post(LIST, async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json(credentialFixture(), { status: 201 });
      }),
    );
    const { user } = renderSection();

    await user.type(await screen.findByLabelText(/client id/i), 'hansel-client-abc');
    await user.type(screen.getByLabelText(/client secret/i), 'a-long-enough-secret');
    await user.type(screen.getByLabelText(/workspace id/i), 'my-workspace');
    await user.click(save());

    expect(await screen.findByText(/does not look like a workspace uuid/i)).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it('puts a rejected field under that field', async () => {
    listReturns([]);
    server.use(
      http.post(LIST, () =>
        HttpResponse.json({ client_id: ['No such Hansel client.'] }, { status: 400 }),
      ),
    );
    const { user } = renderSection();

    await fillNewCredential(user);
    await user.click(save());

    expect(await screen.findByText('No such Hansel client.')).toBeInTheDocument();
    // No generic banner on top of a specific, correct field error.
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it('puts the asset-type rejection under the asset-type field', async () => {
    // The server runs the same cross-field rule the form does, and can reject
    // for reasons the form cannot know. Without `default_asset_type_id` in
    // FIELD_SLOTS this message lands in the form-level banner instead — beside
    // the field it is actually about, rather than on it.
    listReturns([]);
    server.use(
      http.post(LIST, () =>
        HttpResponse.json(
          { default_asset_type_id: ['Set a Hansel asset type UUID before enabling sync.'] },
          { status: 400 },
        ),
      ),
    );
    const { user } = renderSection();

    await fillNewCredential(user);
    await user.type(screen.getByLabelText(/asset type id/i), ASSET_TYPE);
    await user.click(save());

    expect(
      await screen.findByText('Set a Hansel asset type UUID before enabling sync.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it('names a duplicate workspace in its own words, before sending it', async () => {
    // Sent, this comes back as DRF's "The fields parent_company, workspace_id
    // must make a unique set." The viewset's readable sentence is only
    // reachable on the concurrent-create race the validator gets to first.
    listReturns([credentialFixture()]);
    server.use(
      http.post(LIST, async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json(credentialFixture(), { status: 201 });
      }),
    );
    const { user } = renderSection();

    await user.click(await screen.findByRole('button', { name: /add workspace/i }));
    await fillNewCredential(user);
    await user.click(save());

    expect(await screen.findByText(/already has credentials/i)).toBeInTheDocument();
    expect(screen.queryByText(/unique set/i)).not.toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it('surfaces the duplicate-workspace rejection, which belongs to no field', async () => {
    listReturns([]);
    server.use(
      http.post(LIST, () =>
        HttpResponse.json(
          { non_field_errors: ['This organization already has credentials for that workspace.'] },
          { status: 400 },
        ),
      ),
    );
    const { user } = renderSection();

    await fillNewCredential(user);
    await user.click(save());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/already has credentials/i);
    // The typed values survive, so the user can edit rather than retype.
    expect(screen.getByLabelText(/client id/i)).toHaveValue('hansel-client-abc');
  });

  it('does not blame a deployment when the server cannot encrypt the secret', async () => {
    listReturns([]);
    server.use(
      http.post(LIST, () =>
        HttpResponse.json(
          { error: 'encryption_unavailable', message: 'Contact your administrator.' },
          { status: 503 },
        ),
      ),
    );
    const { user } = renderSection();

    await fillNewCredential(user);
    await user.click(save());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/retrying will not help/i);
    expect(alert).not.toHaveTextContent(/try again in a minute/i);
  });

  it('asks which organization only when there is more than one', async () => {
    listReturns([]);
    const { user } = renderSection(
      userFixture([
        organizationFixture({ id: 7, name: 'Hoosier OsteoTronix', is_primary: true }),
        organizationFixture({ id: 4, name: 'Second Org', is_primary: false }),
      ]),
    );
    server.use(
      http.post(LIST, async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json(credentialFixture(), { status: 201 });
      }),
    );

    const picker = await screen.findByRole('combobox', { name: /organization/i });
    await user.click(picker);
    await user.click(await screen.findByRole('option', { name: 'Second Org' }));

    await fillNewCredential(user);
    await user.click(save());

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ parent_company: 4 });
  });

  it('does not offer a picker to a single-organization user', async () => {
    listReturns([]);
    renderSection();

    expect(await screen.findByLabelText(/client id/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /organization/i })).not.toBeInTheDocument();
    expect(screen.getByText(/hoosier osteotronix/i)).toBeInTheDocument();
  });
});

describe('editing', () => {
  it('omits client_secret when the field is left blank', async () => {
    // The assertion that protects a working credential: sending `''` would
    // replace the stored secret with one that cannot authenticate.
    listReturns([credentialFixture()]);
    server.use(
      http.patch(ONE, async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json(credentialFixture());
      }),
    );
    const { user } = renderSection();

    await user.click(await screen.findByRole('button', { name: /edit/i }));
    await user.clear(screen.getByLabelText(/client id/i));
    await user.type(screen.getByLabelText(/client id/i), 'a-corrected-client');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).not.toHaveProperty('client_secret');
    expect(sent[0]).toMatchObject({ client_id: 'a-corrected-client' });
    // And never the organization, which the server refuses to change.
    expect(sent[0]).not.toHaveProperty('parent_company');
  });

  it('sends a replacement secret when one is typed, having warned first', async () => {
    listReturns([credentialFixture()]);
    server.use(
      http.patch(ONE, async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json(credentialFixture());
      }),
    );
    const { user } = renderSection();

    await user.click(await screen.findByRole('button', { name: /edit/i }));
    // The server clears last_verified_at on a new secret; the form says so
    // before the badge disappears rather than after.
    expect(screen.getByText(/clears the last check result/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/client secret/i), 'a-brand-new-secret');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ client_secret: 'a-brand-new-secret' });
  });

  it('leaves the stored credential alone on cancel', async () => {
    listReturns([credentialFixture()]);
    const { user } = renderSection();

    await user.click(await screen.findByRole('button', { name: /edit/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.queryByLabelText(/client secret/i)).not.toBeInTheDocument();
    expect(screen.getByText('•••• 9f2c')).toBeInTheDocument();
  });
});

describe('testing the connection', () => {
  function verifyReturns(body: Record<string, unknown>, status = 200) {
    server.use(http.post(`${ONE}verify/`, () => HttpResponse.json(body, { status })));
  }

  it('reports a working credential', async () => {
    listReturns([credentialFixture()]);
    verifyReturns({
      ok: true,
      error: '',
      message: '',
      checked_at: '2026-08-17T15:00:00Z',
      expires_in: 3600,
    });
    const { user } = renderSection();

    await user.click(await screen.findByRole('button', { name: /test connection/i }));

    expect(await screen.findByText(/hansel accepted these credentials/i)).toBeInTheDocument();
    expect(screen.getByText(/lasts 60 minutes/i)).toBeInTheDocument();
  });

  it('reports a rejected credential, which also arrives as HTTP 200', async () => {
    // The trap: `mutation.isSuccess` here means "we asked", not "they work".
    listReturns([credentialFixture()]);
    verifyReturns({
      ok: false,
      error: 'invalid_credentials',
      message: 'server copy',
      checked_at: '2026-08-17T15:00:00Z',
      expires_in: null,
    });
    const { user } = renderSection();

    await user.click(await screen.findByRole('button', { name: /test connection/i }));

    expect(await screen.findByText(/hansel rejected these credentials/i)).toBeInTheDocument();
    expect(screen.queryByText(/hansel accepted/i)).not.toBeInTheDocument();
  });

  it('says it once, even after the refetch stores the same failure', async () => {
    // The row renders `last_verification_error` and the live result from one
    // copy map, and the invalidation after a check makes them agree — so the
    // live result has to supersede the stored line rather than sit under it.
    listReturns([credentialFixture({ last_verification_error: 'invalid_credentials' })]);
    verifyReturns({
      ok: false,
      error: 'invalid_credentials',
      message: 'server copy',
      checked_at: '2026-08-17T15:00:00Z',
      expires_in: null,
    });
    const { user } = renderSection();

    await user.click(await screen.findByRole('button', { name: /test connection/i }));

    await waitFor(() =>
      expect(screen.getAllByText(/hansel rejected these credentials/i)).toHaveLength(1),
    );
  });

  it('explains the throttle rather than showing the house generic', async () => {
    listReturns([credentialFixture()]);
    verifyReturns({ detail: 'Request was throttled.' }, 429);
    const { user } = renderSection();

    await user.click(await screen.findByRole('button', { name: /test connection/i }));

    expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument();
  });
});

describe('removing', () => {
  it('asks first, then deletes', async () => {
    listReturns([credentialFixture()]);
    server.use(
      http.delete(ONE, () => {
        sent.push('deleted');
        listReturns([]);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = renderSection();

    await user.click(await screen.findByRole('button', { name: /remove/i }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/secret is destroyed/i)).toBeInTheDocument();
    expect(sent).toHaveLength(0);

    await user.click(within(dialog).getByRole('button', { name: /remove/i }));

    await waitFor(() => expect(sent).toEqual(['deleted']));
    // The refetched empty list puts the form back.
    expect(await screen.findByLabelText(/client secret/i)).toBeInTheDocument();
  });
});
