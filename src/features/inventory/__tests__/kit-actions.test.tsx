import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { KitActions } from '../components/kit-actions';

import { kitFixture } from './kit-fixture';

/**
 * Only Update Status does anything in this build, and what it opens is tested
 * in `update-status-dialog.test.tsx` — which already has the query provider,
 * the Radix jsdom stubs and the facet handler that testing it needs. What is
 * worth testing here is *which actions appear and in what state*, all four of
 * which come from the kit's real data.
 *
 * The dialog is mounted only while open, so nothing extra renders here and
 * this file stays prop-driven: no provider, no stubs, no MSW.
 */
describe('KitActions', () => {
  it('offers the three kit actions plus pairing for an untracked kit', () => {
    render(<KitActions kit={kitFixture()} />);

    expect(screen.getByRole('button', { name: /Update Status/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /^Transfer/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Return to Manufacturer/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Pair Hansel Tracker/ })).toBeEnabled();
  });

  it('names the manufacturer in the return action', () => {
    render(<KitActions kit={kitFixture()} />);
    expect(screen.getByText('Send back to Treace')).toBeInTheDocument();
  });

  it('drops the pairing action once a beacon is attached', () => {
    // A tracked kit gets the Live Location panel instead — offering to pair a
    // second beacon is an action the backend rejects with `kit_has_tracker`.
    render(
      <KitActions kit={kitFixture({ tracker: { id: 7, beacon_id: 'HSL-1', is_active: true } })} />,
    );

    expect(screen.queryByRole('button', { name: /Pair Hansel Tracker/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('disables everything while the kit is in transit', () => {
    // A kit already moving cannot be sent somewhere else; the pending transfer
    // has to be resolved first.
    render(
      <KitActions
        kit={kitFixture({ active_transfer_id: 9, active_transfer_destination_name: 'Regional' })}
      />,
    );

    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
  });

  it('flags the recommended route out for an expired kit', () => {
    render(<KitActions kit={kitFixture({ expiration_date: '2020-01-15' })} />);

    // Asserted on the annotation text rather than the accessible name: the
    // name concatenates title, annotation and description into one run, so
    // matching it would pin punctuation and spacing this test does not care
    // about.
    expect(screen.getByText('· recommended')).toBeInTheDocument();
    expect(screen.getByText('· to Warehouse only')).toBeInTheDocument();
  });

  it('carries no annotations for a healthy kit', () => {
    render(<KitActions kit={kitFixture()} />);

    expect(screen.queryByText('· recommended')).not.toBeInTheDocument();
    expect(screen.queryByText('· to Warehouse only')).not.toBeInTheDocument();
    expect(screen.getByText('· optional')).toBeInTheDocument();
  });
});
