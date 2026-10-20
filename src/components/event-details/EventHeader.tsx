import { useRef, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { X } from 'lucide-react';
import type { GoogleCalendarEvent, GoogleCalendar } from '../../types/calendar';

interface FormData {
  summary: string;
  location: string;
}

interface EventHeaderProps {
  event: GoogleCalendarEvent | null;
  formData: FormData;
  setFormData: (data: FormData | ((prev: FormData) => FormData)) => void;
  handleAutoSave: (field: 'summary' | 'location' | 'description') => void;
  isEditingTitle: boolean;
  setIsEditingTitle: (editing: boolean) => void;
  calendars: GoogleCalendar[];
  selectedCalendarId: string;
  onClose: () => void;
  isSaving: boolean;
  lastSavedData: {
    summary: string;
    location: string;
    description: string;
  } | null;
}

/**
 * EventHeader component - Displays the event header with editable title
 * Implements click-to-edit pattern for the event title
 */
export function EventHeader({
  event,
  formData,
  setFormData,
  handleAutoSave,
  isEditingTitle,
  setIsEditingTitle,
  calendars,
  selectedCalendarId,
  onClose,
  isSaving,
  lastSavedData,
}: EventHeaderProps) {
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus title input when editing
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  const isReadOnly =
    !!event?.recurringEventId ||
    isSaving ||
    !['writer', 'owner'].includes(
      calendars.find((c) => c.id === selectedCalendarId)?.accessRole || ''
    );

  return (
    <div className="flex flex-row items-center gap-2 p-6 pb-2">
      {/* Calendar color indicator */}
      <div
        className="w-3 h-3 rounded-sm flex-shrink-0"
        style={{
          backgroundColor:
            calendars.find((c) => c.id === selectedCalendarId)?.backgroundColor || '#1d8cdb',
        }}
        aria-label={calendars.find((c) => c.id === selectedCalendarId)?.summary || 'Calendar'}
      />

      {/* Title (click-to-edit) */}
      <div className="flex-1 min-w-0">
        {isEditingTitle ? (
          <Input
            ref={titleInputRef}
            value={formData.summary}
            onChange={(e) => setFormData((prev) => ({ ...prev, summary: e.target.value }))}
            onBlur={() => {
              setIsEditingTitle(false);
              handleAutoSave('summary');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setIsEditingTitle(false);
                handleAutoSave('summary');
              }
              if (e.key === 'Escape') {
                setFormData((prev) => ({
                  ...prev,
                  summary: lastSavedData?.summary || event?.summary || '',
                }));
                setIsEditingTitle(false);
              }
            }}
            disabled={isReadOnly}
            className="text-lg font-semibold border-none shadow-none p-0 h-auto focus-visible:ring-0"
            autoFocus
          />
        ) : (
          <h2
            className="text-lg font-semibold cursor-text truncate"
            onClick={() => {
              if (!isReadOnly) {
                setIsEditingTitle(true);
              }
            }}
          >
            {formData.summary || event?.summary || 'Untitled Event'}
          </h2>
        )}
      </div>

      {/* Close button */}
      <Button variant="ghost" size="sm" onClick={onClose} className="flex-shrink-0">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
