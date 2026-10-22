import { useState, useCallback } from 'react';
import { decodeEventId, encodeEventId } from '../lib/event-id-utils';
import { MessageType } from '../lib/message-types';
import { mergeTagsIntoDescription } from '../lib/tag-utils';
import { diag } from '../lib/diag-panel';
import { toRecurringClient, syncWindow } from '../lib/recurring/panel-client';
import { saveRecurringField } from '../lib/recurring/recurring-save';
import type { EditScope } from '../lib/recurring/recurring-edit';
import type { GoogleCalendarEvent } from '../types/calendar';

interface FormData {
  summary: string;
  location: string;
}

interface UseEventAutoSaveParams {
  eventId: string | null;
  event: GoogleCalendarEvent | null;
  formData: FormData;
  descriptionDraft: string;
  tagsDraft: string;
  createCalendarService: () => any;
  selectedCalendarId: string;
  /** Which occurrences a recurring edit applies to (tags always apply to the series). */
  scope: EditScope;
  /** Called with the first occurrence of the new series after a "following" split. */
  onReselect: (encodedEventId: string) => void;
  /** Called with the series master after a tags write. */
  onMasterRefreshed: (master: GoogleCalendarEvent) => void;
}

interface UseEventAutoSaveReturn {
  isSaving: boolean;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  error: string | null;
  lastSavedData: {
    summary: string;
    location: string;
    description: string;
    tags: string;
  } | null;
  handleAutoSave: (field: 'summary' | 'location' | 'description' | 'tags') => Promise<void>;
  setLastSavedData: (data: { summary: string; location: string; description: string; tags: string } | null) => void;
  setSaveStatus: (status: 'idle' | 'saving' | 'saved' | 'error') => void;
  setError: (error: string | null) => void;
  setEvent: (event: GoogleCalendarEvent) => void;
}

/**
 * Custom hook to manage event autosave logic with change detection
 * Extracts autosave logic from EventDetailsPanel
 */
export function useEventAutoSave({
  eventId,
  event,
  formData,
  descriptionDraft,
  tagsDraft,
  createCalendarService,
  selectedCalendarId,
  scope,
  onReselect,
  onMasterRefreshed,
}: UseEventAutoSaveParams): UseEventAutoSaveReturn {
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastSavedData, setLastSavedData] = useState<{
    summary: string;
    location: string;
    description: string;
    tags: string;
  } | null>(null);
  const [, setEvent] = useState<GoogleCalendarEvent | null>(event);

  const handleAutoSave = useCallback(
    async (field: 'summary' | 'location' | 'description' | 'tags') => {
      if (!event) return;

      // Check if value actually changed
      const currentValue =
        field === 'summary'
          ? formData.summary
          : field === 'location'
          ? formData.location
          : field === 'description'
          ? descriptionDraft
          : tagsDraft;
      const savedValue =
        field === 'tags'
          ? (lastSavedData?.tags || '')
          : (lastSavedData?.[field] || event[field] || '');

      if (currentValue === savedValue) return; // No changes

      const calendarService = createCalendarService();
      if (!calendarService) {
        setError('Calendar service not available. Please sign in.');
        setSaveStatus('error');
        return;
      }

      setIsSaving(true);
      setSaveStatus('saving');
      const { eventId: decodedEventId, calendarId: shortCalendarId } = decodeEventId(eventId!);

      try {
        if (event.recurringEventId) {
          const result = await saveRecurringField({
            client: toRecurringClient(calendarService.events),
            calendarId: selectedCalendarId,
            instance: event,
            field,
            scope,
            values: {
              summary: formData.summary,
              location: formData.location,
              description: descriptionDraft,
              tags: tagsDraft,
            },
            window: syncWindow(),
          });
          diag('api', 'info', 'recurring save', {
            eventId: decodedEventId,
            seriesId: event.recurringEventId,
            scope: field === 'tags' ? 'series' : scope,
          });
          if (result.master) onMasterRefreshed(result.master);
          if (result.reselectInstanceId) {
            onReselect(encodeEventId(result.reselectInstanceId, shortCalendarId));
          }
        } else {
          const updatedEvent = await calendarService.events.update(
            selectedCalendarId,
            decodedEventId,
            {
              summary: formData.summary,
              location: formData.location,
              description: mergeTagsIntoDescription(descriptionDraft, tagsDraft),
            }
          );

          // Only update event state if fields other than description changed
          // This prevents the editor from re-rendering and stealing focus after autosave
          const hasRelevantChanges =
            updatedEvent.summary !== event.summary ||
            updatedEvent.location !== event.location ||
            updatedEvent.start?.dateTime !== event.start?.dateTime ||
            updatedEvent.end?.dateTime !== event.end?.dateTime;

          if (hasRelevantChanges) {
            setEvent(updatedEvent);
          }
        }

        // Always update lastSavedData to track what we saved
        setLastSavedData({
          summary: formData.summary,
          location: formData.location,
          description: descriptionDraft,
          tags: tagsDraft,
        });
        setSaveStatus('saved');

        // Clear 'saved' status after 2.5 seconds
        setTimeout(() => setSaveStatus('idle'), 2500);

        // Trigger sync
        chrome.runtime.sendMessage({ type: MessageType.TRIGGER_SYNC });
      } catch (err) {
        console.error('[useEventAutoSave] Failed to save event:', err);
        setError(err instanceof Error ? err.message : 'Failed to save event');
        setSaveStatus('error');
        // DON'T rollback - keep user's edit
      } finally {
        setIsSaving(false);
      }
    },
    [event, formData, descriptionDraft, tagsDraft, lastSavedData, createCalendarService, selectedCalendarId, eventId, scope, onReselect, onMasterRefreshed]
  );

  return {
    isSaving,
    saveStatus,
    error,
    lastSavedData,
    handleAutoSave,
    setLastSavedData,
    setSaveStatus,
    setError,
    setEvent,
  };
}
