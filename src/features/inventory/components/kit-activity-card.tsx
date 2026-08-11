import type { InventoryKitHistory } from '@/api/generated/model';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatLogDate } from '@/lib/dates';
import { cn } from '@/lib/utils';

import { historyActor } from '../kit-detail';

interface Props {
  entries: readonly InventoryKitHistory[] | undefined;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
  className?: string;
}

/**
 * The kit's change log, newest first.
 *
 * Secondary content: the route does not block on it, and a failure here never
 * stops the kit rendering. Where the mobile screen removes the whole section on
 * failure, this keeps the card and says so — on a desktop two-column layout a
 * vanishing card leaves a hole, and worse, "no section" reads as "this kit has
 * no history", which is a different and false statement.
 */
export function KitActivityCard({ entries, isPending, isError, onRetry, className }: Props) {
  return (
    <Card className={cn('gap-0 py-0', className)}>
      <CardHeader className="border-b py-3.5">
        {/* A real heading, like every other section on this page — the card is
            a region, and a `<div>` gives a screen reader nothing to jump to. */}
        <CardTitle asChild>
          <h2>Recent Activity</h2>
        </CardTitle>
        <CardAction>
          {/* Stub, like the action cards — there is no full history screen yet. */}
          <Button variant="link" size="sm" className="text-primary" onClick={() => {}}>
            View All ›
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="px-0 py-0">
        {isPending ? (
          <Rows>
            {[0, 1, 2].map((index) => (
              <li key={index} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="h-3 w-14 shrink-0" />
                <Skeleton className="h-3 flex-1" />
                <Skeleton className="h-3 w-10 shrink-0" />
              </li>
            ))}
          </Rows>
        ) : isError ? (
          <Empty>
            Activity is unavailable right now.
            <Button variant="link" size="sm" className="ml-1 text-primary" onClick={onRetry}>
              Retry
            </Button>
          </Empty>
        ) : !entries || entries.length === 0 ? (
          <Empty>No activity recorded yet.</Empty>
        ) : (
          <Rows>
            {entries.map((entry) => (
              <li
                key={entry.history_id}
                className="flex gap-3 border-b border-border px-4 py-3 text-sm last:border-b-0"
              >
                <time dateTime={entry.history_date} className="w-24 shrink-0 text-muted-foreground">
                  {formatLogDate(entry.history_date)}
                </time>
                <span className="min-w-0 flex-1 text-foreground">{entry.history_summary}</span>
                <span className="shrink-0 text-muted-foreground">{historyActor(entry)}</span>
              </li>
            ))}
          </Rows>
        )}
      </CardContent>
    </Card>
  );
}

function Rows({ children }: { children: React.ReactNode }) {
  return <ol className="flex flex-col">{children}</ol>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-center text-sm text-muted-foreground">{children}</p>;
}
