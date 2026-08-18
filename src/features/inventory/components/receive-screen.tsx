import { useState } from 'react';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import { ReceiveKitForm } from './receive-kit-form';
import { ReceiveSkuForm } from './receive-sku-form';

/**
 * Receive / Load Inventory.
 *
 * Two exclusive pairs of mode buttons over a single form card. Only Kit +
 * Manual is built; the other three combinations are honest placeholders, as
 * they are on mobile.
 */

type ItemType = 'kit' | 'sku';
type EntryMethod = 'manual' | 'bulk';

const ITEM_TYPES: { value: ItemType; title: string; subtitle: string }[] = [
  { value: 'kit', title: 'Kit', subtitle: 'Load full kits' },
  { value: 'sku', title: 'SKU', subtitle: 'Load individual items' },
];

const ENTRY_METHODS: { value: EntryMethod; title: string; subtitle: string }[] = [
  { value: 'manual', title: 'Manual', subtitle: 'Add items one at a time' },
  { value: 'bulk', title: 'Bulk Upload', subtitle: 'Add items from a file' },
];

export function ReceiveScreen() {
  // Component state, not search params. On-Hand puts its filters in the URL
  // because a filtered list is worth linking to; half a data-entry form is not,
  // and none of the fields below would be in the URL anyway.
  const [itemType, setItemType] = useState<ItemType>('kit');
  const [entryMethod, setEntryMethod] = useState<EntryMethod>('manual');

  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-semibold text-primary">Receive / Load Inventory</h1>

      <Card className="max-w-[880px] gap-5 p-6">
        {/*
          Stacked, so the four cards read as the prototype's 2x2 `.mode-grid`:
          Kit / SKU on the first row, Manual / Bulk Upload on the second. Side
          by side they would run 4-across, which reads as one choice of four
          rather than two choices of two.
        */}
        <div className="flex flex-col gap-3">
          <ModeGroup
            name="receive-item-type"
            label="What are you loading?"
            value={itemType}
            options={ITEM_TYPES}
            onChange={setItemType}
          />
          <ModeGroup
            name="receive-entry-method"
            label="How are you entering it?"
            value={entryMethod}
            options={ENTRY_METHODS}
            onChange={setEntryMethod}
          />
        </div>

        {entryMethod === 'manual' ? (
          // Keyed, so switching Kit <-> SKU remounts rather than carrying one
          // form's state into the other. They share three option lists but not
          // a payload, and a half-filled kit bleeding into a SKU would be worse
          // than re-picking.
          itemType === 'kit' ? (
            <ReceiveKitForm key="kit" />
          ) : (
            <ReceiveSkuForm key="sku" />
          )
        ) : (
          <p className="py-6 text-sm font-medium text-muted-foreground">
            {modeLabel(itemType, entryMethod)} — coming soon
          </p>
        )}
      </Card>
    </div>
  );
}

function modeLabel(itemType: ItemType, entryMethod: EntryMethod): string {
  const item = ITEM_TYPES.find((option) => option.value === itemType)?.title ?? '';
  const method = ENTRY_METHODS.find((option) => option.value === entryMethod)?.title ?? '';
  return `${item} / ${method}`;
}

/**
 * One exclusive pair, as a radio group of cards.
 *
 * Two mutually exclusive choices *are* a radio group, and the semantics are
 * what this is after: `role="radio"` with `aria-checked`, arrow-key navigation
 * within the group, and a group label — so tests select by role rather than by
 * class.
 *
 * **Native inputs rather than the vendored `RadioGroupItem`, and the reason is
 * a bug this shipped with.** That primitive renders a 4px `<button
 * role="radio">` and ignores children, so a card has to wrap it and hide it —
 * and a `<label>` does *not* forward clicks to a button the way it does to an
 * input. The cards were therefore unclickable by mouse, while every test
 * passed, because a test clicks the radio directly rather than the card a user
 * aims at. A native radio inside its label is forwarded by the platform, so the
 * whole card is the hit target and the semantics come for free.
 *
 * `ToggleGroup` was the other candidate and is worse: it is built for compact
 * icon toolbars, and its items have no room for the subtitle line the prototype
 * and mobile both carry.
 */
function ModeGroup<T extends string>({
  name,
  label,
  value,
  options,
  onChange,
}: {
  name: string;
  label: string;
  value: T;
  options: { value: T; title: string; subtitle: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-3">
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            'flex cursor-pointer flex-col rounded-lg border-2 px-4 py-3.5 transition-colors',
            'focus-within:ring-2 focus-within:ring-ring',
            value === option.value
              ? 'border-primary bg-brand-container'
              : 'border-border bg-card hover:border-primary',
          )}
        >
          <input
            type="radio"
            // Shared `name` is what makes the pair exclusive and gives the
            // group arrow-key navigation without any JavaScript.
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="sr-only"
          />
          <span className="text-sm font-semibold text-foreground">{option.title}</span>
          <span className="mt-0.5 text-xs text-muted-foreground">{option.subtitle}</span>
        </label>
      ))}
    </div>
  );
}
