import { createFileRoute } from '@tanstack/react-router';

import { ComingSoon } from '@/components/coming-soon';

export const Route = createFileRoute('/_authenticated/inventory/dashboard')({
  component: () => (
    <ComingSoon
      title="Inventory Dashboard"
      description="Metrics, alerts and recent activity land here."
    />
  ),
});
