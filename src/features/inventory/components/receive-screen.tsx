import { useState } from 'react';

import { Card } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';

import { ReceiveKitForm } from './receive-kit-form';

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
            label="What are you loading?"
            value={itemType}
            options={ITEM_TYPES}
            onChange={setItemType}
          />
          <ModeGroup
            label="How are you entering it?"
            value={entryMethod}
            options={ENTRY_METHODS}
            onChange={setEntryMethod}
          />
        </div>

        {itemType === 'kit' && entryMethod === 'manual' ? (
          <ReceiveKitForm />
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
 * One exclusive pair, as a radio group.
 *
 * A radio group is what two mutually exclusive choices *are*: it brings
 * arrow-key navigation, a group label and `role="radio"` with `aria-checked`
 * for free, so tests select by role rather than by class. `ToggleGroup` is
 * built for compact icon toolbars and its items have no room for the subtitle
 * line the prototype and mobile both carry.
 */
function ModeGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; title: string; subtitle: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <RadioGroup
      value={value}
      aria-label={label}
      onValueChange={(next) => onChange(next as T)}
      className="grid grid-cols-2 gap-3"
    >
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
          {/*
            The radio itself is the accessible control and stays in the tree;
            only its visual indicator is hidden, so the card is the hit target
            without the group losing keyboard semantics.
          */}
          <RadioGroupItem value={option.value} className="sr-only" />
          <span className="text-sm font-semibold text-foreground">{option.title}</span>
          <span className="mt-0.5 text-xs text-muted-foreground">{option.subtitle}</span>
        </label>
      ))}
    </RadioGroup>
  );
}
