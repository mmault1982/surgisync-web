import { BanIcon, TruckIcon } from 'lucide-react';

import type { InventoryKitDetail } from '@/api/generated/model';

import { bannerState } from '../kit-detail';

/**
 * The two full-width notices above the kit card.
 *
 * Plain `<div>`s, not shadcn's `Alert`: that is `role="alert"`, an assertive
 * live region, and content present at page load must not sit in one — a screen
 * reader would interrupt itself on every navigation. This is static content in
 * reading order right after the heading, so it needs no role at all.
 *
 * The copy diverges from the prototype on purpose. Its amber banner is a button
 * reading "Click to confirm or cancel transfer" and its red one says "Return to
 * Manufacturer to resolve" — both point at actions that are no-ops in this
 * build. Promising them would be a lie; a dead button would be a worse one.
 */
export function KitDetailBanners({ kit }: { kit: InventoryKitDetail }) {
  const { expiredOn, inTransitTo } = bannerState(kit);

  if (!expiredOn && !inTransitTo) return null;

  return (
    <div className="mb-4 flex flex-col gap-3">
      {expiredOn ? (
        <Banner
          icon={<BanIcon className="size-5 text-destructive" />}
          tone="border-l-destructive bg-brand-container"
          title="Expired — kit cannot be used"
          titleTone="text-destructive"
          detail={`Exp: ${expiredOn}.`}
        />
      ) : null}
      {inTransitTo ? (
        <Banner
          icon={<TruckIcon className="size-5 text-warning" />}
          tone="border-l-warning bg-warning-container"
          // `inTransitTo` is `true` rather than a name when the API reported a
          // transfer without naming its destination — the banner still has to
          // appear, it just has nowhere to point.
          title={inTransitTo === true ? 'In Transit' : `In Transit → ${inTransitTo}`}
          titleTone="text-warning-foreground"
          detail="Transfer in progress."
        />
      ) : null}
    </div>
  );
}

function Banner({
  icon,
  tone,
  title,
  titleTone,
  detail,
}: {
  icon: React.ReactNode;
  tone: string;
  title: string;
  titleTone: string;
  detail: string;
}) {
  return (
    <div className={`flex items-start gap-3 rounded-lg border-l-4 px-4 py-3.5 ${tone}`}>
      <span aria-hidden>{icon}</span>
      <div>
        <p className={`text-sm font-bold ${titleTone}`}>{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
