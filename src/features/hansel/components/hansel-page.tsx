import type { WebUser } from '@/api/generated/model';

import { HanselCredentialsSection } from './hansel-credentials-section';

/**
 * Configuration › Hansel.
 *
 * A stack of independent sections, one per thing there is to configure. Phase 2
 * of the backend ticket adds the tracker sync; when it lands it is a sibling of
 * `HanselCredentialsSection` here and nothing on this page moves.
 *
 * The page holds no query and no error state of its own, deliberately. Each
 * section owns its own request, so a section that 403s or fails does it in
 * place, next to the sections that still work.
 */
export function HanselPage({ user }: { user: WebUser }) {
  return (
    <div className="@container p-6">
      <h1 className="text-2xl font-semibold text-primary">Hansel</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        How this organization connects to Hansel Medical for GPS tracking.
      </p>

      <div className="mt-5 flex max-w-[880px] flex-col gap-5">
        <HanselCredentialsSection user={user} />
      </div>
    </div>
  );
}
