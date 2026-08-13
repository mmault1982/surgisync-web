import { BanIcon, ChevronRightIcon, TruckIcon } from 'lucide-react';
import { useState } from 'react';

import type { InventoryKitDetail } from '@/api/generated/model';

import { bannerState } from '../kit-detail';

import { PendingTransferDialog } from './pending-transfer-dialog';

/**
 * The two full-width notices above the kit card.
 *
 * Plain `<div>`s, not shadcn's `Alert`: that is `role="alert"`, an assertive
 * live region, and content present at page load must not sit in one — a screen
 * reader would interrupt itself on every navigation. This is static content in
 * reading order right after the heading, so it needs no role at all.
 *
 * The amber one is now a button, as the prototype's is: it opens the Pending
 * Transfer dialog. Its copy stops short of the prototype's "Click to confirm or
 * cancel transfer" because cancelling still does not exist here, and half a
 * promise is the most this build can keep.
 *
 * The red one stays inert. The prototype's says "Return to Manufacturer to
 * resolve", and while that action does now exist, an expired kit's banner is
 * not where it lives — the action column below is, and it already annotates
 * itself `· recommended` for exactly this kit.
 */
export function KitDetailBanners({ kit }: { kit: InventoryKitDetail }) {
  const [pendingOpen, setPendingOpen] = useState(false);
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
          detail="Review the transfer to confirm receipt."
          onClick={() => setPendingOpen(true)}
        />
      ) : null}

      {pendingOpen && kit.active_transfer_id !== null ? (
        <PendingTransferDialog
          transferId={kit.active_transfer_id}
          onClose={() => setPendingOpen(false)}
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
  onClick,
}: {
  icon: React.ReactNode;
  tone: string;
  title: string;
  titleTone: string;
  detail: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span aria-hidden>{icon}</span>
      <div className="text-left">
        <p className={`text-sm font-bold ${titleTone}`}>{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
      </div>
    </>
  );
  const shell = 'flex items-start gap-3 rounded-lg border-l-4 px-4 py-3.5';

  // A real <button> only when there is somewhere to go. The inert banner stays
  // a <div>: giving it a role it cannot honour is worse than having none.
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={`${shell} w-full items-center transition-colors hover:brightness-97 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${tone}`}
    >
      {body}
      <ChevronRightIcon aria-hidden className="ml-auto size-4 shrink-0 text-warning-foreground" />
    </button>
  ) : (
    <div className={`${shell} ${tone}`}>{body}</div>
  );
}
