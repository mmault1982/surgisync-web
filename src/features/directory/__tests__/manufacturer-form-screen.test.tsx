import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Company, ManufacturerDetail } from '@/api/generated/model';
import { server } from '@/test/msw/server';

import { ManufacturerFormScreen } from '../components/manufacturer-form-screen';

import { companyFixture, manufacturerDetailFixture } from './manufacturer-fixture';

const MANUFACTURERS = '/api/v1/directory/manufacturers/';
const COMPANY = '/api/v1/directory/companies/:id/';

let calls: string[];

beforeEach(() => {
  calls = [];
  server.use(
    http.post(MANUFACTURERS, async ({ request }) => {
      calls.push('POST manufacturer');
      const body = (await request.json()) as { name: string };
      return HttpResponse.json(manufacturerDetailFixture({ id: 99, name: body.name }), {
        status: 201,
      });
    }),
    http.patch(`${MANUFACTURERS}:id/`, async ({ request }) => {
      calls.push('PATCH manufacturer');
      const body = (await request.json()) as { name: string };
      return HttpResponse.json(manufacturerDetailFixture({ name: body.name }));
    }),
    http.patch(COMPANY, async ({ request }) => {
      calls.push('PATCH company');
      return HttpResponse.json(companyFixture((await request.json()) as Partial<Company>));
    }),
  );
});

function renderForm(manufacturer: ManufacturerDetail | null = null) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onCancel = vi.fn();
  const onSaved = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ManufacturerFormScreen manufacturer={manufacturer} onCancel={onCancel} onSaved={onSaved} />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup(), onCancel, onSaved };
}

const submit = (user: ReturnType<typeof userEvent.setup>, name: string) =>
  user.click(screen.getByRole('button', { name }));

describe('the form', () => {
  it('offers the name and the ten contact fields', () => {
    renderForm();

    // Every label is unique: a `<legend>` groups the controls but does not
    // disambiguate three "Name"s and three "Email"s.
    expect(screen.getByLabelText(/^Name/, { selector: 'input' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Contact email')).toBeInTheDocument();
    expect(screen.getByLabelText('Billing email')).toBeInTheDocument();
    expect(screen.getByLabelText('Contact title')).toBeInTheDocument();
  });

  it('sends nothing when the name is blank', async () => {
    const { user } = renderForm();

    await submit(user, 'Add manufacturer');

    expect(await screen.findByText('Enter a name.')).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it('shows a name clash under the field, not as a form-level alert', async () => {
    server.use(
      http.post(MANUFACTURERS, () =>
        HttpResponse.json({ name: ['Already taken.'] }, { status: 400 }),
      ),
    );
    const { user } = renderForm();

    await user.type(screen.getByLabelText(/^Name/, { selector: 'input' }), 'Acme Ortho');
    await submit(user, 'Add manufacturer');

    expect(await screen.findByText('Already taken.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('creating', () => {
  it('posts the name, then patches the company', async () => {
    const { user, onSaved } = renderForm();

    await user.type(screen.getByLabelText(/^Name/, { selector: 'input' }), 'Beta Devices');
    await user.type(screen.getByLabelText('Email'), 'hello@beta.test');
    await submit(user, 'Add manufacturer');

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(calls).toEqual(['POST manufacturer', 'PATCH company']);
  });

  it('spends one request when only the name was filled in', async () => {
    const { user, onSaved } = renderForm();

    await user.type(screen.getByLabelText(/^Name/, { selector: 'input' }), 'Beta Devices');
    await submit(user, 'Add manufacturer');

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(calls).toEqual(['POST manufacturer']);
  });
});

describe('when the contact write fails after the row was created', () => {
  beforeEach(() => {
    server.use(
      http.patch(COMPANY, () => {
        calls.push('PATCH company');
        return HttpResponse.json(
          { contact_email: ['Enter a valid email address.'] },
          { status: 400 },
        );
      }),
    );
  });

  /**
   * A syntactically valid address the *server* rejects.
   *
   * Not a malformed one: the client validator would refuse that before any
   * request went out, and this describe is about what happens after the first
   * one has already landed.
   */
  async function halfFail() {
    const rendered = renderForm();
    const { user } = rendered;
    await user.type(screen.getByLabelText(/^Name/, { selector: 'input' }), 'Beta Devices');
    await user.type(screen.getByLabelText('Contact email'), 'dana@beta.invalid');
    await submit(user, 'Add manufacturer');
    await screen.findByRole('alert');
    return rendered;
  }

  it('says the row was saved rather than reporting a bare failure', async () => {
    const { onSaved } = await halfFail();

    // The user's next action depends on knowing the row exists: the obvious
    // response to "that did not work" is to fill it in again and resubmit,
    // which is the one thing that must not happen.
    expect(screen.getByRole('alert')).toHaveTextContent(
      /“Beta Devices” was saved, but its contact details were not/,
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('relabels both buttons to match what is left to do', async () => {
    await halfFail();

    expect(screen.getByRole('button', { name: 'Retry contact details' })).toBeInTheDocument();
    // "Cancel" would be a lie — there is nothing left to cancel.
    expect(
      screen.getByRole('button', { name: 'Leave without contact details' }),
    ).toBeInTheDocument();
  });

  it('hands the created row to the route on Leave', async () => {
    const { user, onCancel } = await halfFail();

    await submit(user, 'Leave without contact details');

    // So the route sends the user to the record rather than to the list, where
    // it would look as though nothing had been created.
    expect(onCancel).toHaveBeenCalledWith(expect.objectContaining({ id: 99 }));
  });

  it('retries only the contact write, carrying the correction', async () => {
    const { user, onSaved } = await halfFail();
    let body: unknown;
    server.use(
      http.patch(COMPANY, async ({ request }) => {
        calls.push('PATCH company');
        body = await request.json();
        return HttpResponse.json(companyFixture());
      }),
    );
    calls = [];

    const email = screen.getByLabelText('Contact email');
    await user.clear(email);
    await user.type(email, 'dana@beta.test');
    await submit(user, 'Retry contact details');

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    // Never a second POST — the regression the save module exists to prevent.
    expect(calls).toEqual(['PATCH company']);
    expect(body).toMatchObject({ contact_email: 'dana@beta.test' });
  });
});

describe('amending', () => {
  const record = manufacturerDetailFixture({
    company: companyFixture({ phone: '555-0100' }),
  });

  it('sends only the rename when the contact block is untouched', async () => {
    const { user, onSaved } = renderForm(record);

    const name = screen.getByLabelText(/^Name/, { selector: 'input' });
    await user.clear(name);
    await user.type(name, 'Acme Orthopaedics');
    await submit(user, 'Save');

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(calls).toEqual(['PATCH manufacturer']);
  });

  it('sends nothing when nothing changed', async () => {
    const { user, onSaved } = renderForm(record);

    await submit(user, 'Save');

    // Nothing to send is not a failed save: closing is the honest response to
    // "save" on a form the user has not changed.
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(record));
    expect(calls).toEqual([]);
  });
});
