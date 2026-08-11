import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { KitActivityCard } from '../components/kit-activity-card';

import { historyFixture } from './kit-fixture';

const BASE = { entries: undefined, isPending: false, isError: false, onRetry: () => {} };

describe('KitActivityCard', () => {
  it('renders each entry with its date, summary and actor', () => {
    render(
      <KitActivityCard
        {...BASE}
        entries={[
          historyFixture({ history_id: 1, history_summary: 'Status → Complete' }),
          historyFixture({
            history_id: 2,
            history_date: '2026-01-25T09:00:00Z',
            history_summary: 'Used in Case #4521',
          }),
        ]}
      />,
    );

    expect(screen.getByText('Status → Complete')).toBeInTheDocument();
    expect(screen.getByText('Used in Case #4521')).toBeInTheDocument();
    expect(screen.getByText('Jan 28')).toBeInTheDocument();
    expect(screen.getAllByText('Brad')).toHaveLength(2);
  });

  it('attributes an unattributed change to System', () => {
    // `history_user` is null for changes made before user tracking existed, or
    // from a shell or background job.
    render(<KitActivityCard {...BASE} entries={[historyFixture({ history_user: null })]} />);
    expect(screen.getByText('System')).toBeInTheDocument();
  });

  it('says so when the kit has no history', () => {
    render(<KitActivityCard {...BASE} entries={[]} />);
    expect(screen.getByText('No activity recorded yet.')).toBeInTheDocument();
  });

  it('keeps the card and offers a retry when the fetch failed', async () => {
    // Deliberately not the mobile behaviour of removing the section: an absent
    // card reads as "this kit has no history", which is a different claim.
    const onRetry = vi.fn();
    render(<KitActivityCard {...BASE} isError onRetry={onRetry} />);

    expect(screen.getByRole('heading', { name: 'Recent Activity' })).toBeInTheDocument();
    expect(screen.getByText(/Activity is unavailable right now/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('shows placeholder rows while loading, not an empty state', () => {
    render(<KitActivityCard {...BASE} isPending />);

    expect(screen.queryByText('No activity recorded yet.')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recent Activity' })).toBeInTheDocument();
  });
});
