import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { InventoryKitDetail } from '@/api/generated/model';

import { KitInfoCard } from '../components/kit-info-card';

import { kitFixture, photoFixture } from './kit-fixture';

/**
 * `KitInfoCard` takes a kit and renders it — no queries, no router — so this
 * needs neither MSW handlers nor the Radix jsdom stub block. That is the point
 * of keeping every component on this screen prop-driven.
 */
function renderCard(overrides: Partial<InventoryKitDetail> = {}) {
  render(<KitInfoCard kit={kitFixture(overrides)} />);
}

/**
 * The `<dd>` paired with a label, found through the description list.
 *
 * Good for the scalar fields and for an empty Photos row. Not for a populated
 * one: that `<dd>` holds a grid, so `textContent` returns every caption run
 * together. `kit-photos.test.tsx` covers the thumbnails properly.
 */
function valueFor(label: string): string {
  const term = screen.getByText(label);
  const value = term.parentElement?.querySelector('dd');
  return value?.textContent ?? '';
}

describe('KitInfoCard', () => {
  it('renders the kit name, ownership and kit id', () => {
    renderCard();

    expect(screen.getByRole('heading', { name: 'MTP Fusion Plate' })).toBeInTheDocument();
    expect(screen.getByText('Loaned')).toBeInTheDocument();
    expect(screen.getByText('Kit ID: TRC-MTP-2200')).toBeInTheDocument();
  });

  it('pairs every label with its value', () => {
    renderCard();

    expect(valueFor('Manufacturer')).toBe('Treace');
    expect(valueFor('Lot #')).toBe('LOT-2025-1290');
    expect(valueFor('Rep / Assigned To')).toBe('John Smith');
    expect(valueFor('Physical Location')).toBe('Rep Vehicle');
    expect(valueFor('Entity')).toBe('Hoosier OsteoTronix');
  });

  it('has no Site field', () => {
    // The prototype's SITE cell is demo data with no API field behind it, and
    // the mobile screen has none either. Pinned so it cannot creep back in.
    renderCard();
    expect(screen.queryByText('Site')).not.toBeInTheDocument();
  });

  it('formats the expiry as a calendar date', () => {
    renderCard();
    expect(valueFor('Expiration')).toBe('03-01-2027');
  });

  it('marks an expired kit, and only an expired kit', () => {
    const { container } = render(
      <KitInfoCard kit={kitFixture({ expiration_date: '2020-01-15' })} />,
    );
    const expiry = within(container).getByText('01-15-2020');
    expect(expiry.className).toContain('text-destructive');

    expect(screen.getByText('Expiration')).toBeInTheDocument();
  });

  it('omits the kit id line and ownership badge when the API has neither', () => {
    renderCard({ manufacturer_kit_id: null, ownership_type: undefined });

    expect(screen.queryByText(/^Kit ID:/)).not.toBeInTheDocument();
    expect(screen.queryByText('Loaned')).not.toBeInTheDocument();
  });

  it('carries a Photos row under Entity', () => {
    renderCard();

    const labels = Array.from(document.querySelectorAll('dt')).map((dt) => dt.textContent);
    expect(labels.at(-1)).toBe('Photos');
    expect(labels.at(-2)).toBe('Entity');
  });

  it('shows the em-dash when the kit has no photos', () => {
    renderCard();
    expect(valueFor('Photos')).toBe('\u2014');
  });

  it('renders one thumbnail per photo, newest first', () => {
    renderCard({
      photos: [
        photoFixture({ id: 1, created_at: '2026-01-15T08:00:00Z' }),
        photoFixture({ id: 2, created_at: '2026-04-20T17:30:00Z' }),
      ],
      photo_count: 2,
    });

    const thumbnails = screen.getAllByRole('button', { name: /^View photo/ });
    expect(thumbnails).toHaveLength(2);
    expect(thumbnails[0]).toHaveAccessibleName(/Apr 2[01]/);
    expect(thumbnails[1]).toHaveAccessibleName(/Jan 1[45]/);
  });
});
