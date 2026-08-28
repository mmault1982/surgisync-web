import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { PartComponent } from '@/api/generated/model';
import { renderWithRouter } from '@/test/router';

import { KitComponentsTable } from '../components/kit-components-table';

/**
 * The Bill of Materials table.
 *
 * Presentational, so no MSW and no query client — only `renderWithRouter`,
 * because the Description cell is a real anchor and `<Link>` reads the router
 * from context.
 *
 * The fixture gives `id` and `item` **different** numbers on purpose. They are
 * the junction row and the component part respectively, and with them equal
 * every assertion below passes while a link built from the wrong one ships.
 */
function component(overrides: Partial<PartComponent> = {}): PartComponent {
  return {
    id: 41,
    item: 7,
    item_uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    description: 'Locking Screw 3.5mm',
    category: 'Screws',
    reference_number: 'LS-3500',
    quantity: 4,
    ...overrides,
  };
}

async function renderTable({
  rows = [component()],
  canManage = true,
}: { rows?: PartComponent[]; canManage?: boolean } = {}) {
  const onOpenRow = vi.fn();
  const onEdit = vi.fn();
  const onDelete = vi.fn();

  renderWithRouter(
    <KitComponentsTable
      rows={rows}
      canManage={canManage}
      onOpenRow={onOpenRow}
      onEdit={onEdit}
      onDelete={onDelete}
    />,
  );
  await screen.findByRole('table');

  return { onOpenRow, onEdit, onDelete, user: userEvent.setup() };
}

/** The cell under a given column header, for the table's only row. */
function cellUnder(header: string) {
  const headers = screen.getAllByRole('columnheader');
  const index = headers.findIndex((cell) => cell.textContent?.trim() === header);
  return screen.getAllByRole('row')[1]?.querySelectorAll('td')[index];
}

describe('KitComponentsTable', () => {
  it('renders each value under its own header', async () => {
    // The invariant behind `COLUMNS` being one array rather than two: parallel
    // header and cell arrays once put the right header over the wrong field
    // while typechecking perfectly.
    await renderTable();

    expect(cellUnder('Description')).toHaveTextContent('Locking Screw 3.5mm');
    expect(cellUnder('Category')).toHaveTextContent('Screws');
    expect(cellUnder('Reference #')).toHaveTextContent('LS-3500');
    expect(cellUnder('Qty')).toHaveTextContent('4');
  });

  it('links the description to the component part, not the BOM row', async () => {
    await renderTable();

    expect(screen.getByRole('link', { name: 'Locking Screw 3.5mm' })).toHaveAttribute(
      'href',
      '/inventory/product-catalog/7',
    );
  });

  it('opens the component part when the row is clicked', async () => {
    const { onOpenRow, user } = await renderTable();

    await user.click(screen.getByText('Screws'));

    expect(onOpenRow).toHaveBeenCalledWith(7);
  });

  it('leaves a modified click to the link', async () => {
    // Navigating programmatically would swallow the modifier and do the one
    // thing the user did not ask for.
    const { onOpenRow, user } = await renderTable();

    await user.keyboard('{Meta>}');
    await user.click(screen.getByText('Screws'));
    await user.keyboard('{/Meta}');

    expect(onOpenRow).not.toHaveBeenCalled();
  });

  it('does not open the row behind the action buttons', async () => {
    const { onOpenRow, onEdit, onDelete, user } = await renderTable();

    await user.click(screen.getByRole('button', { name: 'Edit quantity for Locking Screw 3.5mm' }));
    expect(onEdit).toHaveBeenCalledWith(component());
    expect(onOpenRow).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole('button', { name: 'Remove Locking Screw 3.5mm from this kit' }),
    );
    expect(onDelete).toHaveBeenCalledWith(component());
    expect(onOpenRow).not.toHaveBeenCalled();
  });

  it('renders an em dash for a blank category and a missing catalog number', async () => {
    await renderTable({ rows: [component({ category: '', reference_number: null })] });

    expect(cellUnder('Category')).toHaveTextContent('—');
    expect(cellUnder('Reference #')).toHaveTextContent('—');
  });

  it('drops the whole Actions column for someone who cannot write', async () => {
    // The column, not disabled buttons: a control nobody can use is noise.
    await renderTable({ canManage: false });

    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
