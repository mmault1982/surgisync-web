import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ManufacturerDetailScreen } from '../components/manufacturer-detail-screen';

import { companyFixture, manufacturerDetailFixture } from './manufacturer-fixture';

/**
 * Props only — no router, no query client, no MSW. That is the whole point of
 * the split: the route owns the data and the navigation, this owns the markup.
 */
function renderScreen(manufacturer = manufacturerDetailFixture(), canManage = true) {
  const onEdit = vi.fn();
  render(
    <ManufacturerDetailScreen manufacturer={manufacturer} canManage={canManage} onEdit={onEdit} />,
  );
  return { onEdit };
}

const FILLED = manufacturerDetailFixture({
  barcode: 'https://example.test/barcode.png',
  company: companyFixture({
    phone: '555-0100',
    fax: '555-0101',
    email: 'hello@acme.test',
    contact_name: 'Dana Reed',
    contact_title: 'Account Manager',
    contact_email: 'dana@acme.test',
    contact_phone: '555-0102',
    billing_contact_name: 'Sam Fry',
    billing_contact_email: 'billing@acme.test',
    billing_contact_phone: '555-0103',
  }),
});

describe('the record', () => {
  it('shows the contact and billing blocks', () => {
    renderScreen(FILLED);

    expect(screen.getByRole('heading', { name: 'Acme Ortho' })).toBeInTheDocument();
    expect(screen.getByText('hello@acme.test')).toBeInTheDocument();
    expect(screen.getByText('Account Manager')).toBeInTheDocument();
    expect(screen.getByText('billing@acme.test')).toBeInTheDocument();
  });

  it('keeps the three blocks apart', () => {
    // "Email" appears in all three, so a flat list of eleven rows would not say
    // which is which.
    renderScreen(FILLED);

    expect(screen.getByRole('heading', { name: 'Organization contact' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Contact person' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Billing contact' })).toBeInTheDocument();
  });

  it('reports the barcode as a health signal rather than showing it', () => {
    renderScreen(FILLED);
    expect(screen.getByText('Barcode generated')).toBeInTheDocument();
  });

  it('renders a blank field as an em dash and says so once when all are blank', () => {
    // An all-em-dash card would otherwise read as something that failed to
    // load; no manufacturer carries a contact block yet.
    renderScreen();

    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(
      screen.getByText('No contact details recorded for this manufacturer yet.'),
    ).toBeInTheDocument();
  });
});

describe('who may write', () => {
  it('offers Edit to an admin on a row the organization owns', () => {
    const { onEdit } = renderScreen();

    screen.getByRole('button', { name: 'Edit manufacturer' }).click();

    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it('offers nothing to a reader', () => {
    renderScreen(FILLED, false);
    expect(screen.queryByRole('button', { name: 'Edit manufacturer' })).not.toBeInTheDocument();
  });

  it('offers nothing on a row the organization does not own', () => {
    // Reads span every organization the caller belongs to; writes are filed
    // under one, so a write here would 404. The record is still readable.
    renderScreen(manufacturerDetailFixture({ is_owned: false }), true);

    expect(screen.queryByRole('button', { name: 'Edit manufacturer' })).not.toBeInTheDocument();
    expect(screen.getByText('Shared')).toBeInTheDocument();
  });
});
