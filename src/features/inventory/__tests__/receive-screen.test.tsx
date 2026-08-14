import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '@/test/msw/server';

import { ReceiveScreen } from '../components/receive-screen';

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }));

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

const emptyPage = () =>
  HttpResponse.json({
    total_data: 0,
    current_page: 1,
    total_pages: 1,
    next: null,
    previous: null,
    results: [],
  });

beforeEach(() => {
  server.use(
    http.get('/api/v1/manufacturers/', emptyPage),
    http.get('/api/v1/parts/', emptyPage),
    http.get('/api/v1/inventory-transfers/targets/', () => HttpResponse.json({ results: [] })),
    http.get('/api/v1/stock-items/physical-locations/', () => HttpResponse.json({ results: [] })),
  );
});

function renderScreen() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ReceiveScreen />
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

describe('ReceiveScreen', () => {
  it('defaults to Kit + Manual with the form showing', () => {
    renderScreen();

    expect(screen.getByRole('radio', { name: /Kit/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Manual/ })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Save Kit' })).toBeInTheDocument();
  });

  it('presents the four modes as two exclusive groups', () => {
    // A radio group is what two mutually exclusive choices *are*, and it is why
    // these are selectable by role rather than by class.
    renderScreen();

    expect(screen.getByRole('radiogroup', { name: /What are you loading/ })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: /How are you entering it/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /SKU/ })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /Bulk Upload/ })).not.toBeChecked();
  });

  it('replaces the form with a placeholder for SKU', async () => {
    const user = renderScreen();

    await user.click(screen.getByRole('radio', { name: /SKU/ }));

    expect(screen.getByText('SKU / Manual — coming soon')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Kit' })).not.toBeInTheDocument();
  });

  it('replaces the form with a placeholder for Bulk Upload', async () => {
    const user = renderScreen();

    await user.click(screen.getByRole('radio', { name: /Bulk Upload/ }));

    expect(screen.getByText('Kit / Bulk Upload — coming soon')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Kit' })).not.toBeInTheDocument();
  });

  it('keeps the unbuilt modes selectable', async () => {
    // Mobile shows a placeholder rather than disabling them: the four modes are
    // the shipped information architecture, and a dead control says less than
    // an honest "coming soon".
    const user = renderScreen();

    await user.click(screen.getByRole('radio', { name: /SKU/ }));

    expect(screen.getByRole('radio', { name: /SKU/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Kit/ })).not.toBeChecked();
  });

  it('returns to the form when Kit + Manual is chosen again', async () => {
    const user = renderScreen();

    await user.click(screen.getByRole('radio', { name: /SKU/ }));
    await user.click(screen.getByRole('radio', { name: /Kit/ }));

    expect(screen.getByRole('button', { name: 'Save Kit' })).toBeInTheDocument();
  });
});
