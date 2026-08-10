import { createFileRoute } from '@tanstack/react-router';

import { ComingSoon } from '@/components/coming-soon';

export const Route = createFileRoute('/_authenticated/inventory/receive')({
  component: () => (
    <ComingSoon
      title="Receive / Load"
      description="Receiving kits into stock and loading them for a case lands here."
    />
  ),
});
