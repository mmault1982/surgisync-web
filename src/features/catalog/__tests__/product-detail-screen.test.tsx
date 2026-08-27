import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { PartDetail } from '@/api/generated/model';

import { ProductDetailScreen } from '../components/product-detail-screen';

function part(overrides: Partial<PartDetail> = {}): PartDetail {
  return {
    id: 7,
    uuid: 'aaaaaaaa-0000-0000-0000-000000000000',
    name: 'Locking Screw 3.5mm',
    description: 'Locking Screw 3.5mm',
    category: 'Screws',
    kind: 'component',
    reference_number: 'LS-3500',
    is_serialized: false,
    manufacturer: 9,
    manufacturer_name: 'Treace Medical',
    udi: '00860000000017',
    list_price: '42.50',
    ...overrides,
  };
}

function renderDetail(overrides: Partial<PartDetail> = {}, canManage = true) {
  const onEdit = vi.fn();
  // No router and no query client: the screen is props-only, which is the
  // whole point of the route/screen split.
  render(<ProductDetailScreen part={part(overrides)} canManage={canManage} onEdit={onEdit} />);
  return { onEdit, user: userEvent.setup() };
}

/** The value rendered under a given `<dt>`. */
function detail(label: string) {
  const term = screen.getByText(label);
  return term.nextElementSibling;
}

describe('the record', () => {
  it('shows every field the screen is for', () => {
    renderDetail();

    expect(detail('Manufacturer')).toHaveTextContent('Treace Medical');
    expect(detail('Reference #')).toHaveTextContent('LS-3500');
    expect(detail('Kind')).toHaveTextContent('Component');
    expect(detail('UDI')).toHaveTextContent('00860000000017');
    expect(detail('Price')).toHaveTextContent('$42.50');
    expect(detail('Description')).toHaveTextContent('Locking Screw 3.5mm');
    expect(detail('Category')).toHaveTextContent('Screws');
  });

  it('puts Category immediately after Description, which is what places it alongside', () => {
    renderDetail();

    const labels = screen.getAllByRole('term').map((dt) => dt.textContent);

    expect(labels.slice(-2)).toEqual(['Description', 'Category']);
  });

  it('falls back to an em dash for a part with no category', () => {
    renderDetail({ category: '' });

    expect(detail('Category')).toHaveTextContent('—');
  });

  it('reads description rather than the deprecated name alias', () => {
    renderDetail({ name: 'Stale Alias', description: 'Cortical Screw' });

    expect(screen.getByRole('heading', { name: /Cortical Screw/ })).toBeInTheDocument();
    expect(screen.queryByText('Stale Alias')).not.toBeInTheDocument();
  });

  it('says how a serialized part is stocked, not just that it is', () => {
    renderDetail({ is_serialized: true });

    expect(detail('Stocking')).toHaveTextContent('Serialized');
    expect(detail('Stocking')).toHaveTextContent('One row per physical unit');
  });

  it('says the same for a bulk part', () => {
    renderDetail({ is_serialized: false });

    expect(detail('Stocking')).toHaveTextContent('Bulk');
  });

  it('renders an em dash where a kit has no reference number', () => {
    // Kits carry no catalog number at all — the em dash says "not applicable"
    // rather than looking like something failed to load.
    renderDetail({ kind: 'kit', reference_number: null });

    expect(detail('Reference #')).toHaveTextContent('—');
  });

  it('renders an em dash for a part with no UDI or price', () => {
    renderDetail({ udi: null, list_price: null });

    expect(detail('UDI')).toHaveTextContent('—');
    expect(detail('Price')).toHaveTextContent('—');
  });

  it('badges a kit as a kit', () => {
    renderDetail({ kind: 'kit' });

    expect(detail('Kind')).toHaveTextContent('Kit');
  });
});

describe('editing', () => {
  it('offers Edit to an admin', async () => {
    const { onEdit, user } = renderDetail();

    await user.click(screen.getByRole('button', { name: 'Edit product' }));

    expect(onEdit).toHaveBeenCalledOnce();
  });

  it('offers nothing to a rep, who could still read the record', () => {
    renderDetail({}, false);

    expect(screen.queryByRole('button', { name: 'Edit product' })).not.toBeInTheDocument();
    expect(detail('Price')).toHaveTextContent('$42.50');
  });
});
