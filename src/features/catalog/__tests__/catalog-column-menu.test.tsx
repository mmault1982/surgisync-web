import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '@/test/msw/server';

import { CATALOG_DEFAULTS, type CatalogSearch } from '../catalog.search';
import { CatalogColumnMenu, type ColumnKey } from '../components/catalog-column-menu';

/**
 * Radix's popper measures its trigger and content, and jsdom implements neither
 * ResizeObserver nor the pointer-capture methods it calls on open. Neither is
 * being tested here — the positioning they drive has no layout engine to act
 * on, so collision handling, flipping and clipping stay Playwright's job. These
 * stubs only let the panel mount. Copied from `inventory/__tests__/column-menu.test.tsx`.
 */
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

const MANUFACTURERS = [
  { id: 5, name: 'Arthrex' },
  { id: 9, name: 'Treace Medical' },
];

beforeEach(() => {
  server.use(
    http.get('/api/v1/parts/manufacturers/', () => HttpResponse.json({ results: MANUFACTURERS })),
  );
});

function renderMenu(
  search: Partial<CatalogSearch> = {},
  column: { key: ColumnKey; label: string } = { key: 'kind', label: 'Kind' },
) {
  const onChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  const { container } = render(
    <QueryClientProvider client={client}>
      <CatalogColumnMenu
        columnKey={column.key}
        label={column.label}
        search={{ ...CATALOG_DEFAULTS, ...search }}
        onChange={onChange}
      />
    </QueryClientProvider>,
  );

  const indicator = () => container.querySelector('[data-column-indicator]');

  return { onChange, user: userEvent.setup(), indicator };
}

describe('CatalogColumnMenu', () => {
  it('opens a dialog, not a menu', async () => {
    // Not cosmetic: the panel holds checkboxes, so menu semantics would be
    // wrong and a DropdownMenu's typeahead would swallow typing.
    const { user } = renderMenu();

    await user.click(screen.getByRole('button', { name: 'Kind' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  describe('the Kind filter, which is two boxes over a scalar parameter', () => {
    it('shows both kinds checked when nothing is filtered', async () => {
      // "No filter" means both kinds are shown, so both boxes read as ticked.
      // An empty control would say the opposite of what the table is doing.
      const { user } = renderMenu();

      await user.click(screen.getByRole('button', { name: 'Kind' }));

      expect(screen.getByRole('checkbox', { name: 'Kit' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'Component' })).toBeChecked();
    });

    it('unticking one narrows to the other', async () => {
      const { user, onChange } = renderMenu();

      await user.click(screen.getByRole('button', { name: 'Kind' }));
      await user.click(screen.getByText('Kit'));

      expect(onChange).toHaveBeenCalledWith({ kind: 'component' });
    });

    it('ticking the second box back clears the filter', async () => {
      // Both selected is the same question as neither: show me everything.
      const { user, onChange } = renderMenu({ kind: 'component' });

      await user.click(screen.getByRole('button', { name: /Kind/ }));
      await user.click(screen.getByText('Kit'));

      expect(onChange).toHaveBeenCalledWith({ kind: undefined });
    });

    it('unticking the only remaining box also clears the filter', async () => {
      // Rather than sending a value that would match nothing.
      const { user, onChange } = renderMenu({ kind: 'component' });

      await user.click(screen.getByRole('button', { name: /Kind/ }));
      await user.click(screen.getByText('Component'));

      expect(onChange).toHaveBeenCalledWith({ kind: undefined });
    });

    it('offers no sort, because a two-valued enum does not sort', async () => {
      const { user } = renderMenu();

      await user.click(screen.getByRole('button', { name: 'Kind' }));

      expect(screen.queryByText('Sort')).not.toBeInTheDocument();
    });
  });

  describe('the Manufacturer filter', () => {
    const column = { key: 'manufacturer' as const, label: 'Manufacturer' };

    it('lists the facet values and selects by clicking the label text', async () => {
      // A pointer aims at the name, not the 16px box. `htmlFor` is what makes
      // that work, and it is easy to break without noticing.
      const { user, onChange } = renderMenu({}, column);

      await user.click(screen.getByRole('button', { name: 'Manufacturer' }));
      await user.click(await screen.findByText('Treace Medical'));

      expect(onChange).toHaveBeenCalledWith({ manufacturer_id: [9] });
    });

    it('adds to the selection rather than replacing it', async () => {
      const { user, onChange } = renderMenu({ manufacturer_id: [5] }, column);

      await user.click(screen.getByRole('button', { name: /Manufacturer/ }));
      await user.click(await screen.findByText('Treace Medical'));

      expect(onChange).toHaveBeenCalledWith({ manufacturer_id: [5, 9] });
    });

    it('sends undefined, not an empty array, when the last value is cleared', async () => {
      // `[]` would serialize as a filter matching nothing; `undefined` strips
      // the parameter from the URL entirely.
      const { user, onChange } = renderMenu({ manufacturer_id: [5] }, column);

      await user.click(screen.getByRole('button', { name: /Manufacturer/ }));
      await user.click(await screen.findByText('Arthrex'));

      expect(onChange).toHaveBeenCalledWith({ manufacturer_id: undefined });
    });

    it('sorts as well as filters', async () => {
      const { user, onChange } = renderMenu({}, column);

      await user.click(screen.getByRole('button', { name: 'Manufacturer' }));
      await user.click(await screen.findByRole('button', { name: '↑ Asc' }));

      expect(onChange).toHaveBeenCalledWith({ ordering: 'manufacturer_name' });
    });
  });

  describe('the header indicator', () => {
    it('says what the column can do, and what it is doing', () => {
      const cases: {
        column: { key: ColumnKey; label: string };
        search: Partial<CatalogSearch>;
        state: string;
      }[] = [
        // Sorts and filters.
        {
          column: { key: 'manufacturer', label: 'Manufacturer' },
          search: {},
          state: 'sort-filter',
        },
        // Sorts only. Note `search: {}` means the *default* ordering, which is
        // `name` ascending — so the Name column reads as the active sort out of
        // the box, and only a column that is not the default shows the bare
        // capability glyph.
        { column: { key: 'reference_number', label: 'Reference #' }, search: {}, state: 'sort' },
        {
          column: { key: 'name', label: 'Name' },
          search: { ordering: '-reference_number' },
          state: 'sort',
        },
        { column: { key: 'name', label: 'Name' }, search: {}, state: 'sort-asc' },
        // Filters only — Kind has no sort, so it must not show a sort glyph.
        { column: { key: 'kind', label: 'Kind' }, search: {}, state: 'filter' },
        // Active sort replaces the capability glyph with the direction.
        {
          column: { key: 'name', label: 'Name' },
          search: { ordering: 'name' },
          state: 'sort-asc',
        },
        {
          column: { key: 'name', label: 'Name' },
          search: { ordering: '-name' },
          state: 'sort-desc',
        },
      ];

      for (const { column, search, state } of cases) {
        const { indicator } = renderMenu(search, column);
        expect(indicator()?.getAttribute('data-column-indicator')).toBe(state);
      }
    });

    it('keeps the icon out of the trigger name and puts the count in it', () => {
      // Every test above matches the trigger by its exact accessible name, so
      // the icon must stay aria-hidden. The badge is deliberately inside it.
      const { indicator } = renderMenu(
        { manufacturer_id: [5, 9] },
        { key: 'manufacturer', label: 'Manufacturer' },
      );

      // The badge is inside the trigger and carries no separating whitespace,
      // so the accessible name is "Manufacturer2" — which is why every match
      // above is a substring rather than an exact name.
      expect(indicator()).toHaveAttribute('aria-hidden');
      expect(screen.getByRole('button', { name: /Manufacturer/ })).toHaveTextContent('2');
    });

    it('counts a kind filter as one, since the parameter is scalar', () => {
      renderMenu({ kind: 'kit' }, { key: 'kind', label: 'Kind' });

      expect(screen.getByRole('button', { name: /Kind/ })).toHaveTextContent('1');
    });
  });
});
