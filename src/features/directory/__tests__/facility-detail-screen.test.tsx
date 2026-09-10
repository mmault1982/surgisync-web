import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FacilityDetailScreen } from '../components/facility-detail-screen';

import { companyFixture } from './company-fixture';
import { facilityDetailFixture } from './facility-fixture';

/**
 * Props only — no router, no QueryClient, no MSW.
 *
 * That is the whole point of the split this screen makes: the address book and
 * the mutations live in sibling components the route mounts, so this one
 * renders bare.
 */
function renderScreen(
  facility = facilityDetailFixture(),
  { canManage = true }: { canManage?: boolean } = {},
) {
  const onEdit = vi.fn();
  render(<FacilityDetailScreen facility={facility} canManage={canManage} onEdit={onEdit} />);
  return { onEdit };
}

describe('the record', () => {
  it('leads with the name and the type', () => {
    renderScreen(facilityDetailFixture({ facility_type: 'surgery_center' }));

    expect(screen.getByRole('heading', { name: 'Mercy General Hospital' })).toBeInTheDocument();
    expect(screen.getByText('Ambulatory Surgery Center')).toBeInTheDocument();
  });

  it('says nothing about onboarding status', () => {
    // Listing data — the Facilities table shows it as a column and filters on
    // it — not part of this record's identity.
    renderScreen(facilityDetailFixture({ onboarding_status: 'completed' }));

    expect(screen.queryByText(/Completed/)).not.toBeInTheDocument();
  });

  it('groups the blocks, contacts first', () => {
    // Six groups rather than one flat list because "Email" appears in three of
    // them. Contacts lead: who to call is what someone opening this record is
    // usually after, and a GPO member ID is reference data they look up
    // deliberately.
    renderScreen();

    const headings = screen
      .getAllByRole('heading', { level: 3 })
      .map((heading) => heading.textContent);

    expect(headings).toEqual([
      'Organization contact',
      'Contact person',
      'Billing contact',
      'Affiliations',
      'Identifiers',
      'Licensing and accreditation',
    ]);
  });

  it('renders a recorded value', () => {
    renderScreen(facilityDetailFixture({ npi_number: '1234567890', gpo_affiliation: 'Vizient' }));

    expect(screen.getByText('1234567890')).toBeInTheDocument();
    expect(screen.getByText('Vizient')).toBeInTheDocument();
  });

  it('renders a date as a calendar date, not a timezone-shifted one', () => {
    // `formatCalendarDate`, never `new Date(...)`: constructing a Date from a
    // bare `YYYY-MM-DD` parses it as UTC midnight and can render the day
    // before, west of Greenwich.
    renderScreen(facilityDetailFixture({ state_license_expiration: '2027-03-01' }));

    expect(screen.getByText('03-01-2027')).toBeInTheDocument();
  });

  it('says once, quietly, that no contacts are recorded', () => {
    renderScreen();

    expect(
      screen.getByText('No contact details recorded for this facility yet.'),
    ).toBeInTheDocument();
  });

  it('drops that line as soon as one is', () => {
    renderScreen(facilityDetailFixture({ company: companyFixture({ phone: '555-0100' }) }));

    expect(
      screen.queryByText('No contact details recorded for this facility yet.'),
    ).not.toBeInTheDocument();
  });

  it('omits the Notes block when there are none', () => {
    renderScreen();

    expect(screen.queryByRole('heading', { name: 'Notes' })).not.toBeInTheDocument();
  });

  it('shows notes when there are some', () => {
    renderScreen(facilityDetailFixture({ notes: 'Dock 4 after 6pm.' }));

    expect(screen.getByRole('heading', { name: 'Notes' })).toBeInTheDocument();
    expect(screen.getByText('Dock 4 after 6pm.')).toBeInTheDocument();
  });
});

describe('a deactivated facility', () => {
  it('says so, and says what it does and does not mean', () => {
    renderScreen(facilityDetailFixture({ is_active: false }));

    expect(screen.getByText('Deactivated')).toBeInTheDocument();
    expect(screen.getByText(/keeps its name/)).toBeInTheDocument();
    expect(screen.getByText(/Reactivate it from the Facilities list/)).toBeInTheDocument();
  });

  it('is still editable — a stood-down row is not a read-only one', () => {
    renderScreen(facilityDetailFixture({ is_active: false }));

    expect(screen.getByRole('button', { name: /Edit facility/ })).toBeInTheDocument();
  });
});

describe('who may write', () => {
  it('offers Edit to an admin on an owned row', () => {
    renderScreen();

    expect(screen.getByRole('button', { name: /Edit facility/ })).toBeInTheDocument();
  });

  it('offers nothing to a rep', () => {
    renderScreen(facilityDetailFixture(), { canManage: false });

    expect(screen.queryByRole('button', { name: /Edit facility/ })).not.toBeInTheDocument();
  });

  it('offers nothing on a row this organization does not own', () => {
    // Readable, but every write against it is a 404 — so the control would
    // only teach that on submit.
    renderScreen(facilityDetailFixture({ is_owned: false }));

    expect(screen.getByText('Read only')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit facility/ })).not.toBeInTheDocument();
  });
});
