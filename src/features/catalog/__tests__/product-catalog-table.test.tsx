import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { PartList } from '@/api/generated/model';
import { renderWithRouter } from '@/test/router';

import { CATALOG_DEFAULTS } from '../catalog.search';
import { ProductCatalogTable } from '../components/product-catalog-table';

function part(overrides: Partial<PartList> = {}): PartList {
  return {
    id: 7,
    uuid: 'aaaaaaaa-0000-0000-0000-000000000000',
    name: 'Locking Screw 3.5mm',
    description: 'Locking Screw 3.5mm',
    kind: 'component',
    reference_number: 'LS-3500',
    is_serialized: false,
    manufacturer: 9,
    manufacturer_name: 'Treace Medical',
    ...overrides,
  };
}

/**
 * Async because the stub router resolves its first match on a tick — nothing
 * is in the DOM synchronously after `render`. See `src/test/router.tsx`.
 */
async function renderTable({
  rows = [part()],
  canManage = true,
}: { rows?: PartList[]; canManage?: boolean } = {}) {
  const onOpenRow = vi.fn();
  const onEdit = vi.fn();
  const onDelete = vi.fn();

  renderWithRouter(
    <ProductCatalogTable
      rows={rows}
      search={CATALOG_DEFAULTS}
      onSearchChange={vi.fn()}
      canManage={canManage}
      onOpenRow={onOpenRow}
      onEdit={onEdit}
      onDelete={onDelete}
    />,
  );

  await screen.findByRole('table');

  return { onOpenRow, onEdit, onDelete, user: userEvent.setup() };
}

/** The row's own cell — not the Description cell, which holds the link. */
const manufacturerCell = () => screen.getByText('Treace Medical');

describe('opening a row', () => {
  it('opens the part when the row is clicked', async () => {
    const { onOpenRow, user } = await renderTable();

    await user.click(manufacturerCell());

    expect(onOpenRow).toHaveBeenCalledWith(7);
  });

  it('offers the Description cell as a real link', async () => {
    // Not decoration: it is the keyboard path, it gives cmd-click and "open in
    // new tab", and it is what `defaultPreload: 'intent'` prefetches from. A
    // tabbable `<tr>` instead would make every row a tab stop and replace the
    // row/gridcell roles a screen reader navigates the table with.
    await renderTable();

    expect(await screen.findByRole('link', { name: 'Locking Screw 3.5mm' })).toHaveAttribute(
      'href',
      '/inventory/product-catalog/7',
    );
  });

  it('leaves a modified click to the link', async () => {
    // Navigating programmatically would swallow the modifier and do the one
    // thing the user did not ask for.
    const { onOpenRow, user } = await renderTable();

    await user.keyboard('{Meta>}');
    await user.click(manufacturerCell());
    await user.keyboard('{/Meta}');

    expect(onOpenRow).not.toHaveBeenCalled();
  });

  it('does not open the part when an action button is clicked', async () => {
    // The Edit and Remove buttons sit inside the clickable row; without the
    // guard, each would also navigate away behind its own dialog.
    const { onOpenRow, onEdit, user } = await renderTable();

    await user.click(screen.getByRole('button', { name: 'Edit Locking Screw 3.5mm' }));

    expect(onEdit).toHaveBeenCalledOnce();
    expect(onOpenRow).not.toHaveBeenCalled();
  });
});

describe('the actions column', () => {
  it('hands the row to the edit callback', async () => {
    const { onEdit, user } = await renderTable();

    await user.click(screen.getByRole('button', { name: 'Edit Locking Screw 3.5mm' }));

    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
  });

  it('hands the row to the delete callback', async () => {
    const { onDelete, user } = await renderTable();

    await user.click(screen.getByRole('button', { name: 'Remove Locking Screw 3.5mm' }));

    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
  });

  it('is absent entirely for a rep', async () => {
    // Whole column, not disabled buttons: a control nobody can use is noise.
    await renderTable({ canManage: false });

    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit Locking Screw 3.5mm' }),
    ).not.toBeInTheDocument();
  });

  it('still lets a rep open the row', async () => {
    const { onOpenRow, user } = await renderTable({ canManage: false });

    await user.click(manufacturerCell());

    expect(onOpenRow).toHaveBeenCalledWith(7);
  });

  it('labels its buttons by the description, not the deprecated name alias', async () => {
    // Reading `row.name` here would work today and silently break when the
    // alias goes; it is also what the label fold moved away from.
    await renderTable({ rows: [part({ name: 'Stale Alias', description: 'Cortical Screw' })] });

    expect(screen.getByRole('button', { name: 'Edit Cortical Screw' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Cortical Screw' })).toBeInTheDocument();
  });
});

describe('the column set', () => {
  it('leads with Description, then Manufacturer — Category is gone', async () => {
    await renderTable();

    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent);

    expect(headers.slice(0, 2)).toEqual(['Description', 'Manufacturer']);
    expect(headers).not.toContain('Category');
  });
});
