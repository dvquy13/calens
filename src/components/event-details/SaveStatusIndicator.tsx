import { Button } from '../ui/button';
import { Loader2, Check, AlertCircle } from 'lucide-react';

interface SaveStatusIndicatorProps {
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  error: string | null;
  onRetry: () => void;
}

/**
 * SaveStatusIndicator component - Displays save status with saving/saved/error states
 */
export function SaveStatusIndicator({ saveStatus, error, onRetry }: SaveStatusIndicatorProps) {
  return (
    <div className="flex items-center gap-2 pt-2 min-h-[40px]">
      {saveStatus === 'saving' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Saving...</span>
        </div>
      )}

      {saveStatus === 'saved' && (
        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
          <Check className="h-4 w-4" />
          <span>Saved</span>
        </div>
      )}

      {saveStatus === 'error' && error && (
        <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="h-4 w-4 mt-0.5" />
          <div className="flex-1">
            <p>{error}</p>
            <Button
              variant="link"
              size="sm"
              className="p-0 h-auto text-red-600 dark:text-red-400 underline"
              onClick={onRetry}
            >
              Retry
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
