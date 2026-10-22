import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { LexicalMarkdownEditor } from '../ui/lexical-markdown-editor';
import { Loader2, HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import type { GoogleCalendarEvent, GoogleCalendar } from '../../types/calendar';

interface FormData {
  summary: string;
  location: string;
}

interface EventFormProps {
  event: GoogleCalendarEvent;
  formData: FormData;
  setFormData: (data: FormData | ((prev: FormData) => FormData)) => void;
  descriptionDraft: string;
  setDescriptionDraft: (draft: string) => void;
  tagsDraft: string;
  setTagsDraft: (draft: string) => void;
  handleTagsBlur: () => void;
  handleAutoSave: (field: 'summary' | 'location' | 'description') => void;
  isSaving: boolean;
  calendars: GoogleCalendar[];
  selectedCalendarId: string;
  eventId: string | null;
  isLoading: boolean;
}

/**
 * EventForm component - Displays event form fields (time, location, description)
 * Handles form input and autosave on blur
 */
export function EventForm({
  event,
  formData,
  setFormData,
  setDescriptionDraft,
  tagsDraft,
  setTagsDraft,
  handleTagsBlur,
  handleAutoSave,
  isSaving,
  calendars,
  selectedCalendarId,
  eventId,
  isLoading,
}: EventFormProps) {
  const formatDuration = (
    startDateTime?: string,
    startDate?: string,
    endDateTime?: string,
    endDate?: string
  ) => {
    // All-day events
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        return '1 day';
      }
      return `${diffDays} days`;
    }

    // Timed events
    if (startDateTime && endDateTime) {
      const start = new Date(startDateTime);
      const end = new Date(endDateTime);
      const diffMs = end.getTime() - start.getTime();
      const diffMinutes = Math.floor(diffMs / (1000 * 60));

      if (diffMinutes < 60) {
        return `${diffMinutes}m`;
      } else {
        const hours = Math.floor(diffMinutes / 60);
        const minutes = diffMinutes % 60;
        if (minutes === 0) {
          return `${hours}h`;
        }
        return `${hours}h ${minutes}m`;
      }
    }

    return '';
  };

  const formatTimeRange = (
    startDateTime?: string,
    startDate?: string,
    endDateTime?: string,
    endDate?: string
  ) => {
    // All-day events
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (startDate === endDate) {
        return (
          new Date(startDate).toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }) + ' (All day)'
        );
      }
      // Multi-day all-day events
      return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }

    // Timed events
    if (startDateTime && endDateTime) {
      const start = new Date(startDateTime);
      const end = new Date(endDateTime);
      const isSameDay = start.toDateString() === end.toDateString();

      if (isSameDay) {
        // Same day: "Mon, Nov 29, 2025 · 2:30 PM - 4:00 PM"
        return `${start.toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })} · ${start.toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
        })} - ${end.toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
        })}`;
      } else {
        // Different days: "Nov 29, 2:30 PM - Nov 30, 4:00 PM"
        return `${start.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        })}, ${start.toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
        })} - ${end.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        })}, ${end.toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
        })}`;
      }
    }

    return 'N/A';
  };

  const isReadOnly =
    isSaving ||
    (calendars.length > 0 && !['writer', 'owner'].includes(
      calendars.find((c) => c.id === selectedCalendarId)?.accessRole || ''
    ));

  return (
    <div className="space-y-3">
      {/* Time Display */}
      <div>
        <p className="text-sm">
          {formatTimeRange(event.start.dateTime, event.start.date, event.end.dateTime, event.end.date)}
          <span className="text-muted-foreground ml-2">
            ({formatDuration(event.start.dateTime, event.start.date, event.end.dateTime, event.end.date)})
          </span>
        </p>
      </div>

      {/* Location Input */}
      <div>
        <Label htmlFor="location">Location</Label>
        <Input
          id="location"
          value={formData.location}
          onChange={(e) => setFormData((prev) => ({ ...prev, location: e.target.value }))}
          onBlur={() => handleAutoSave('location')}
          disabled={isReadOnly}
          className="mt-1"
          placeholder="Add location"
        />
      </div>

      {/* Tags Input */}
      <div>
        <div className="flex items-center gap-1.5">
          <Label htmlFor="tags">Tags</Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs bg-white border border-border">
                <div className="text-sm space-y-1 text-foreground">
                  <p className="font-semibold">Organize events with tags</p>
                  <p>• Comma-separated: Tag A, Tag B, project-123</p>
                  <p>• Case-sensitive, stored in description front-matter</p>
                  <p>• Visible in Google Calendar description</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    When updating tags, you'll be prompted to sync changes to all events with the same name.
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Input
          id="tags"
          value={tagsDraft}
          onChange={(e) => setTagsDraft(e.target.value)}
          onBlur={handleTagsBlur}
          disabled={isReadOnly}
          className="mt-1"
          placeholder="Add tags (e.g., Tag A, Tag B, project-123)"
        />
        {event.recurringEventId && (
          <p className="mt-1 text-xs text-muted-foreground">Tags apply to every occurrence</p>
        )}
      </div>

      {/* Description Editor */}
      <div>
        <div className="flex items-center gap-1.5">
          <Label htmlFor="description">Description</Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs bg-white border border-border">
                <div className="text-sm space-y-1 text-foreground">
                  <p className="font-semibold">Markdown formatting:</p>
                  <p>• Bold: **text**</p>
                  <p>• Italic: *text*</p>
                  <p>• Lists: * item or + item</p>
                  <p>• Checkboxes: [ ] task or [x] done</p>
                  <p className="text-xs text-muted-foreground">(Type checkboxes without dash)</p>
                  <p>• Links: [text](url)</p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="mt-1">
          {event && !isLoading ? (
            <LexicalMarkdownEditor
              key={eventId}
              id={eventId || undefined}
              initialValue={event.description || ''}
              onChange={(value) => setDescriptionDraft(value)}
              onBlur={() => handleAutoSave('description')}
              disabled={isReadOnly}
              placeholder="Add description (supports markdown)"
            />
          ) : (
            <div className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground flex items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading description...
            </div>
          )}
        </div>
      </div>

      {/* Attendees */}
      {event.attendees && event.attendees.length > 0 && (
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            Attendees ({event.attendees.length})
          </label>
          <div className="mt-1 space-y-1">
            {event.attendees.map((attendee, index) => (
              <div key={index} className="text-sm flex items-center gap-2">
                <span>{attendee.displayName || attendee.email}</span>
                {attendee.responseStatus && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      attendee.responseStatus === 'accepted'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : attendee.responseStatus === 'declined'
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        : attendee.responseStatus === 'tentative'
                        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'
                    }`}
                  >
                    {attendee.responseStatus}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
