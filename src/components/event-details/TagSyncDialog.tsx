/**
 * TagSyncDialog Component
 *
 * Modal dialog that prompts users to sync tags to all matching events
 * when they update tags for an event that has other events with the same name.
 */

import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';

interface TagSyncDialogProps {
  eventCount: number;
  seriesCount: number;
  tags: string;
  onConfirm: (shouldSync: boolean) => void;
}

export function TagSyncDialog({ eventCount, seriesCount, tags, onConfirm }: TagSyncDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sync Tags to Related Events?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {seriesCount > 0 ? (
              <>
                Found <strong>{eventCount} events</strong> (<strong>{seriesCount}</strong> recurring
                series) with the same name and calendar.
              </>
            ) : (
              <>
                Found <strong>{eventCount}</strong> other event(s) with the same name and calendar.
              </>
            )}
          </p>
          <div>
            <p className="text-sm font-medium mb-1">New tags:</p>
            <p className="text-sm text-foreground bg-muted px-3 py-2 rounded-md">
              {tags || '(empty)'}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            Would you like to update tags for all matching events?
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => onConfirm(false)}>
              Only This Event
            </Button>
            <Button onClick={() => onConfirm(true)}>
              Sync to All Events
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
