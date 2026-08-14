import { createFileRoute } from '@tanstack/react-router';

import { ReceiveScreen } from '@/features/inventory/components/receive-screen';

export const Route = createFileRoute('/_authenticated/inventory/receive')({
  component: ReceiveScreen,
});
