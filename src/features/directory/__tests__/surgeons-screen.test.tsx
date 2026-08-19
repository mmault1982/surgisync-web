import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SurgeonCatalog } from '@/api/generated/model';
import { server } from '@/test/msw/server';

import { SurgeonsScreen } from '../components/surgeons-screen';
import { SURGEON_DEFAULTS, type SurgeonSearch } from '../surgeons.search';

beforeAll(() => {
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

const SURGEONS = '/api/v1/directory/surgeons/';

let role: string | null = 'admin';
vi.mock('@/auth/auth-context', () => ({
  useAuth: () => ({
    user: { id: 1, email: 'a@b.c', name: 'A', role, organization_name: null, organizations: [] },
  }),
}));

function surgeon(overrides: Partial<SurgeonCatalog> = {}): SurgeonCatalog {
  return { id: 7, name: 'Dr Jane Okafor', npi_number: '1234567890', is_owned: true, ...overrides };
}

const page = (results: SurgeonCatalog[]) => ({
  total_data: results.length,
  current_page: 1,
  total_pages: 1,
  next: null,
  previous: null,
  results,
});

function renderScreen(search: Partial<SurgeonSearch> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <SurgeonsScreen
        search={{ ...SURGEON_DEFAULTS, ...search }}
        onSearchChange={vi.fn()}
        onPageChange={vi.fn()}
      />
    </QueryClientProvider>,
  );
  return { user: userEvent.setup() };
}

let created: unknown[];
let patched: { id: string; body: unknown }[];

beforeEach(() => {
  role = 'admin';
  created = [];
  patched = [];
  server.use(
    http.get(SURGEONS, () => HttpResponse.json(page([surgeon()]))),
    http.post(SURGEONS, async ({ request }) => {
      created.push(await request.json());
      return HttpResponse.json(surgeon({ id: 99 }), { status: 201 });
    }),
    http.patch(`${SURGEONS}:id/`, async ({ request, params }) => {
      patched.push({ id: String(params.id), body: await request.json() });
      return HttpResponse.json(surgeon());
    }),
    http.delete(`${SURGEONS}:id/`, () => HttpResponse.json(surgeon())),
  );
});

describe('the table', () => {
  it('shows the NPI alongside the name', async () => {
    renderScreen();

    expect(await screen.findByText('Dr Jane Okafor')).toBeInTheDocument();
    expect(screen.getByText('1234567890')).toBeInTheDocument();
  });

  it('shows a dash when a surgeon has no NPI', async () => {
    server.use(http.get(SURGEONS, () => HttpResponse.json(page([surgeon({ npi_number: '' })]))));
    renderScreen();

    await screen.findByText('Dr Jane Okafor');
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('offers no controls on a shared roster row', async () => {
    server.use(
      http.get(SURGEONS, () =>
        HttpResponse.json(page([surgeon({ name: 'Dr Seeded', is_owned: false })])),
      ),
    );
    renderScreen();
    await screen.findByText('Dr Seeded');

    expect(screen.queryByRole('button', { name: 'Amend Dr Seeded' })).not.toBeInTheDocument();
    expect(screen.getByText('Shared')).toBeInTheDocument();
  });
});

describe('adding one', () => {
  it('posts both fields, trimmed', async () => {
    const { user } = renderScreen();
    await screen.findByText('Dr Jane Okafor');

    await user.click(screen.getByRole('button', { name: 'Add surgeon' }));
    await user.type(await screen.findByLabelText(/Name/), '  Dr Sam Reyes ');
    await user.type(screen.getByLabelText(/NPI/), '9876543210');
    await user.click(screen.getByRole('button', { name: 'Add surgeon' }));

    await waitFor(() =>
      expect(created).toEqual([{ name: 'Dr Sam Reyes', npi_number: '9876543210' }]),
    );
  });

  it('accepts a surgeon with no NPI', async () => {
    const { user } = renderScreen();
    await screen.findByText('Dr Jane Okafor');

    await user.click(screen.getByRole('button', { name: 'Add surgeon' }));
    await user.type(await screen.findByLabelText(/Name/), 'Dr Unknown');
    await user.click(screen.getByRole('button', { name: 'Add surgeon' }));

    await waitFor(() => expect(created).toEqual([{ name: 'Dr Unknown', npi_number: '' }]));
  });

  it('blocks a malformed NPI before it reaches the server', async () => {
    const { user } = renderScreen();
    await screen.findByText('Dr Jane Okafor');

    await user.click(screen.getByRole('button', { name: 'Add surgeon' }));
    await user.type(await screen.findByLabelText(/Name/), 'Dr Typo');
    await user.type(screen.getByLabelText(/NPI/), '123');
    await user.click(screen.getByRole('button', { name: 'Add surgeon' }));

    expect(await screen.findByText('An NPI is exactly 10 digits.')).toBeInTheDocument();
    expect(created).toEqual([]);
  });

  it('shows a duplicate NPI under the NPI field, not the name', async () => {
    // Which field the clash lands on is the server's judgement, and the user
    // acts on the two differently.
    server.use(
      http.post(SURGEONS, () =>
        HttpResponse.json(
          {
            npi_number: ['A surgeon with this NPI is already available to your organization.'],
          },
          { status: 400 },
        ),
      ),
    );
    const { user } = renderScreen();
    await screen.findByText('Dr Jane Okafor');

    await user.click(screen.getByRole('button', { name: 'Add surgeon' }));
    await user.type(await screen.findByLabelText(/Name/), 'J. Okafor');
    await user.type(screen.getByLabelText(/NPI/), '1234567890');
    await user.click(screen.getByRole('button', { name: 'Add surgeon' }));

    expect(
      await screen.findByText('A surgeon with this NPI is already available to your organization.'),
    ).toBeInTheDocument();
  });
});

describe('amending one', () => {
  it('can clear an NPI entered by mistake', async () => {
    // The blank has to go on the wire; omitting the key would leave the old
    // number in place.
    const { user } = renderScreen();
    await screen.findByText('Dr Jane Okafor');

    await user.click(screen.getByRole('button', { name: 'Amend Dr Jane Okafor' }));
    await user.clear(await screen.findByLabelText(/NPI/));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patched).toEqual([{ id: '7', body: { name: 'Dr Jane Okafor', npi_number: '' } }]),
    );
  });

  it('sends nothing when neither field changed', async () => {
    const { user } = renderScreen();
    await screen.findByText('Dr Jane Okafor');

    await user.click(screen.getByRole('button', { name: 'Amend Dr Jane Okafor' }));
    await screen.findByLabelText(/Name/);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByLabelText(/Name/)).not.toBeInTheDocument());
    expect(patched).toEqual([]);
  });
});

describe('removing one', () => {
  it('names both referents when the server refuses', async () => {
    server.use(
      http.delete(`${SURGEONS}:id/`, () =>
        HttpResponse.json(
          {
            error: 'surgeon_in_use',
            message:
              'Dr Jane Okafor is used by 3 cases and assigned to 2 facilities and cannot be removed.',
          },
          { status: 409 },
        ),
      ),
    );
    const { user } = renderScreen();
    await screen.findByText('Dr Jane Okafor');

    await user.click(screen.getByRole('button', { name: 'Remove Dr Jane Okafor' }));
    await user.click(await screen.findByRole('button', { name: 'Remove' }));

    expect(
      await screen.findByText(
        'Dr Jane Okafor is used by 3 cases and assigned to 2 facilities and cannot be removed.',
      ),
    ).toBeInTheDocument();
  });
});

describe('who may write', () => {
  it('offers nothing to a rep', async () => {
    role = 'non_admin';
    renderScreen();
    await screen.findByText('Dr Jane Okafor');

    expect(screen.queryByRole('button', { name: 'Add surgeon' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument();
  });
});
