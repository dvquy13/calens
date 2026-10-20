import { useState, useEffect, useMemo } from 'react';
import { SendReportLink } from './sidepanel/SendReportLink';
import { Card, CardContent } from './ui/card';
import { Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useEventData } from '../hooks/useEventData';
import { useEventAutoSave } from '../hooks/useEventAutoSave';
import { EventHeader } from './event-details/EventHeader';
import { EventWarnings } from './event-details/EventWarnings';
import { EventForm } from './event-details/EventForm';
import { SaveStatusIndicator } from './event-details/SaveStatusIndicator';
import { TagSyncDialog } from './event-details/TagSyncDialog';
import { parseTagsFromDescription, stripTagsFromDescription } from '../lib/tag-utils';
import { findMatchingEvents, bulkUpdateEventTags } from '../lib/tag-sync';
import { MessageType } from '../lib/message-types';
import type { GoogleCalendarEvent } from '../types/calendar';

interface EventDetailsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string | null;
}

interface FormData {
  summary: string;
  location: string;
}

export function EventDetailsPanel({ isOpen, onClose, eventId }: EventDetailsPanelProps) {
  const { createCalendarService, user } = useAuth();
  const eventData = useEventData({
    eventId,
    isOpen,
    createCalendarService,
    userEmail: user?.email || null,
  });

  const [formData, setFormData] = useState<FormData>({
    summary: '',
    location: '',
  });
  const [descriptionDraft, setDescriptionDraft] = useState<string>('');
  const [tagsDraft, setTagsDraft] = useState<string>('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [matchingEvents, setMatchingEvents] = useState<GoogleCalendarEvent[]>([]);

  const autoSave = useEventAutoSave({
    eventId,
    event: eventData.event,
    formData,
    descriptionDraft,
    tagsDraft,
    createCalendarService,
    selectedCalendarId: eventData.selectedCalendarId,
  });

  // Initialize form data when event loads
  useEffect(() => {
    if (eventData.event && eventId) {
      const description = eventData.event.description || '';
      const tags = parseTagsFromDescription(description);
      const descriptionWithoutTags = stripTagsFromDescription(description);

      const savedData = {
        summary: eventData.event.summary || '',
        location: eventData.event.location || '',
        description: descriptionWithoutTags,
        tags: tags,
      };

      setFormData({
        summary: savedData.summary,
        location: savedData.location,
      });
      setDescriptionDraft(savedData.description);
      setTagsDraft(savedData.tags);
      autoSave.setLastSavedData(savedData);
      autoSave.setSaveStatus('idle');
      autoSave.setError(null);
    }
  }, [eventData.event, eventId]);

  // Create a stable event object with cleaned description
  // Only recalculate when the actual event changes, not when descriptionDraft changes
  const eventWithCleanDescription = useMemo(() => {
    if (!eventData.event) return null;

    const description = eventData.event.description || '';
    const cleanedDescription = stripTagsFromDescription(description);

    return {
      ...eventData.event,
      description: cleanedDescription,
    };
  }, [eventData.event]);

  if (!isOpen) return null;

  const handleTagsBlur = async () => {
    // Auto-save current event first
    await autoSave.handleAutoSave('tags');

    // Check for matching events only if tags changed
    if (eventData.event && user?.email && tagsDraft !== autoSave.lastSavedData?.tags) {
      const matches = await findMatchingEvents(
        eventData.event.summary,
        eventData.selectedCalendarId,
        eventData.event.id,
        user.email
      );

      if (matches.length > 0) {
        setMatchingEvents(matches);
        setShowSyncDialog(true);
      }
    }
  };

  const handleSyncConfirm = async (shouldSync: boolean) => {
    setShowSyncDialog(false);

    if (shouldSync && matchingEvents.length > 0) {
      await bulkUpdateEventTags(
        matchingEvents,
        tagsDraft,
        createCalendarService
      );

      // Trigger calendar sync to refresh cache
      chrome.runtime.sendMessage({ type: MessageType.TRIGGER_SYNC });
    }
  };

  const handleRetry = () => {
    autoSave.setError(null);
    autoSave.setSaveStatus('idle');
    // Retry by re-triggering save for all fields
    autoSave.handleAutoSave('summary');
    autoSave.handleAutoSave('location');
    autoSave.handleAutoSave('description');
    autoSave.handleAutoSave('tags');
  };

  return (
    <Card className="bg-transparent">
      <EventHeader
        event={eventData.event}
        formData={formData}
        setFormData={setFormData}
        handleAutoSave={autoSave.handleAutoSave}
        isEditingTitle={isEditingTitle}
        setIsEditingTitle={setIsEditingTitle}
        calendars={eventData.calendars}
        selectedCalendarId={eventData.selectedCalendarId}
        onClose={onClose}
        isSaving={autoSave.isSaving}
        lastSavedData={autoSave.lastSavedData}
      />
      <CardContent>
        {eventData.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="ml-2 text-sm text-muted-foreground">Loading event...</p>
          </div>
        ) : eventData.error ? (
          <div className="flex items-start gap-2 p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900 rounded-md">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-600 dark:text-red-400">Error</p>
              <p className="text-sm text-red-600/90 dark:text-red-400/90 mt-1">{eventData.error}</p>
              <span className="text-red-600 dark:text-red-400"><SendReportLink error={eventData.error} /></span>
            </div>
          </div>
        ) : eventData.event && eventWithCleanDescription ? (
          <div className="space-y-4">
            <EventWarnings
              event={eventData.event}
              calendars={eventData.calendars}
              selectedCalendarId={eventData.selectedCalendarId}
            />
            <EventForm
              event={eventWithCleanDescription}
              formData={formData}
              setFormData={setFormData}
              descriptionDraft={descriptionDraft}
              setDescriptionDraft={setDescriptionDraft}
              tagsDraft={tagsDraft}
              setTagsDraft={setTagsDraft}
              handleTagsBlur={handleTagsBlur}
              handleAutoSave={autoSave.handleAutoSave}
              isSaving={autoSave.isSaving}
              calendars={eventData.calendars}
              selectedCalendarId={eventData.selectedCalendarId}
              eventId={eventId}
              isLoading={eventData.isLoading}
            />
            <SaveStatusIndicator
              saveStatus={autoSave.saveStatus}
              error={autoSave.error}
              onRetry={handleRetry}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No event selected</p>
        )}
      </CardContent>
      {showSyncDialog && (
        <TagSyncDialog
          eventCount={matchingEvents.length}
          tags={tagsDraft}
          onConfirm={handleSyncConfirm}
        />
      )}
    </Card>
  );
}
