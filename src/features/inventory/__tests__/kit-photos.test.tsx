import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { InventoryKitPhoto } from '@/api/generated/model';

import { KitPhotos } from '../components/kit-photos';

import { kitFixture, photoFixture } from './kit-fixture';

/**
 * No Radix jsdom stub block, deliberately — and this is the one dialog test in
 * the repo without one.
 *
 * CLAUDE.md's rule is about the *popper* primitives: `Select`, `Popover` and
 * `DropdownMenu` measure their trigger and call pointer capture on open, which
 * is why `column-menu.test.tsx` and the four form dialogs carry the block. A
 * plain `Dialog` does none of that — nothing in `@radix-ui/react-dialog`,
 * `react-focus-scope`, `react-remove-scroll` or `aria-hidden` touches
 * `ResizeObserver`, pointer capture or `scrollIntoView`. Verified by deleting
 * the block and watching these nine stay green, not assumed.
 *
 * Add it back the moment this dialog grows a `Select`.
 */
function renderPhotos(photos: InventoryKitPhoto[]) {
  render(<KitPhotos kit={kitFixture({ photos, photo_count: photos.length })} />);
  return userEvent.setup();
}

describe('KitPhotos', () => {
  it('renders the em-dash rather than an empty grid', () => {
    renderPhotos([]);

    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('captions each thumbnail with its date and time', () => {
    renderPhotos([photoFixture({ created_at: '2026-01-28T09:00:00Z' })]);

    // A regex, not a literal: the time renders in the runner's local zone, and
    // newer ICU builds separate it from AM/PM with U+202F.
    expect(screen.getByText(/^Jan 2[78], \d{1,2}:\d{2}\s[AP]M$/)).toBeInTheDocument();
  });

  it('names the thumbnail by what opening it will show', () => {
    renderPhotos([photoFixture({ created_at: '2026-01-28T09:00:00Z' })]);

    expect(screen.getByRole('button')).toHaveAccessibleName(/^View photo, Jan 2[78],/);
  });

  it('falls back to a bare name for a photo the API did not date', () => {
    renderPhotos([photoFixture({ created_at: null })]);

    expect(screen.getByRole('button', { name: 'View photo' })).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('opens the photo full size when its thumbnail is clicked', async () => {
    const user = renderPhotos([
      photoFixture({
        id: 4,
        url: 'https://example.test/4.png',
        created_at: '2026-01-28T09:00:00Z',
      }),
    ]);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^View photo/ }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName(/^Photo, Jan 2[78],/);
    expect(dialog.querySelector('img')).toHaveAttribute('src', 'https://example.test/4.png');
  });

  it('dismisses on Escape and on the close button', async () => {
    const user = renderPhotos([photoFixture()]);

    await user.click(screen.getByRole('button', { name: /^View photo/ }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^View photo/ }));
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the photo that was clicked, not the first one', async () => {
    const user = renderPhotos([
      photoFixture({
        id: 1,
        url: 'https://example.test/1.png',
        created_at: '2026-01-15T08:00:00Z',
      }),
      photoFixture({
        id: 2,
        url: 'https://example.test/2.png',
        created_at: '2026-04-20T17:30:00Z',
      }),
    ]);

    // Newest first, so the second thumbnail is the older photo.
    const [, older] = screen.getAllByRole('button', { name: /^View photo/ });
    await user.click(older!);

    expect(screen.getByRole('dialog').querySelector('img')).toHaveAttribute(
      'src',
      'https://example.test/1.png',
    );
  });

  it('gives an unprocessed photo a tile but not a button', () => {
    renderPhotos([photoFixture({ url: null, created_at: '2026-01-28T09:00:00Z' })]);

    // `url` is nullable, and a photo the server has not finished processing
    // must still be counted — silently dropping it would disagree with
    // `photo_count`.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/^Jan 2[78],/)).toBeInTheDocument();
  });

  it('keeps an unprocessed photo in the grid beside the ones that loaded', () => {
    const { container } = render(
      <KitPhotos
        kit={kitFixture({
          photos: [
            photoFixture({ id: 1, created_at: '2026-01-15T08:00:00Z' }),
            photoFixture({ id: 2, url: null, created_at: '2026-02-15T08:00:00Z' }),
            photoFixture({ id: 3, created_at: '2026-04-20T17:30:00Z' }),
          ],
          photo_count: 3,
        })}
      />,
    );

    expect(container.querySelectorAll('figure')).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: /^View photo/ })).toHaveLength(2);
  });

  it('uses the photo caption as alt text when there is one', () => {
    const { container } = render(
      <KitPhotos
        kit={kitFixture({ photos: [photoFixture({ caption: 'Seal intact' })], photo_count: 1 })}
      />,
    );

    expect(container.querySelector('img')).toHaveAttribute('alt', 'Seal intact');
  });
});
