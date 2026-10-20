import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Heart } from 'lucide-react';
import { DiscordIcon } from '../components/icons/DiscordIcon';
import { COMMUNITY_INVITE_URL, SUPPORT_URL } from '../lib/links';
import { EventDetailsPanel } from '../components/EventDetailsPanel';
import { AuthSection } from '../components/sidepanel/AuthSection';
import { TimeChart } from '../components/sidepanel/TimeChart';
import { DiagnosticsLauncherProvider } from '../components/sidepanel/SendReportLink';
import { DebugButton, DebugContent, DiagnosticsButton, DiagnosticsContent } from '../components/sidepanel/DebugPanel';
import { ContributionGraphSection } from '../components/contribution/ContributionGraphSection';
import { useAuth } from '../hooks/useAuth';
import { useCalendarData } from '../hooks/useCalendarData';
import { useDateRange } from '../hooks/useDateRange';
import { useEventFiltering } from '../hooks/useEventFiltering';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { MessageType } from '../lib/message-types';

export function Sidepanel() {
  // Forward keyboard shortcuts (D, W, M, T, A) to Google Calendar when not editing text
  useKeyboardShortcuts();

  const auth = useAuth();
  const calendarData = useCalendarData(auth);
  const dateRange = useDateRange(auth.isAuthenticated, calendarData.loadCalendarData);

  // Load tags for events (used for tag aggregation view)
  const [eventTagsMap, setEventTagsMap] = useState<Map<string, string[]>>(new Map());

  useEffect(() => {
    if (!auth.isAuthenticated || calendarData.allEvents.length === 0) return;

    const eventIds = calendarData.allEvents.map(e => e.eventId);
    chrome.runtime.sendMessage({
      type: MessageType.GET_EVENT_TAGS,
      eventIds,
    }).then(response => {
      if (response.success && response.data) {
        const map = new Map<string, string[]>();
        Object.entries(response.data).forEach(([eventId, tags]) => {
          map.set(eventId, tags as string[]);
        });
        setEventTagsMap(map);
      }
    }).catch(error => {
      console.error('[Sidepanel] Failed to load tags:', error);
    });
  }, [calendarData.allEvents, auth.isAuthenticated]);

  const filtering = useEventFiltering(calendarData.allEvents, dateRange.dateRange, eventTagsMap);

  const [isEventPanelOpen, setIsEventPanelOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Check if running in development mode
  const isDev = import.meta.env.MODE === 'development';
  // Dev builds carry version_name "<latest tag>-dev" (scripts/manifest-plugin.ts).
  const manifest = chrome.runtime.getManifest();
  const version = manifest.version_name ?? manifest.version;

  // State for Debug and Diagnostics panel toggles
  const [showDebug, setShowDebug] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Inline "Send report" links open Diagnostics with the error they were shown next to.
  const [reportedError, setReportedError] = useState<string | null>(null);
  const diagnosticsRef = useRef<HTMLDivElement>(null);
  const openDiagnostics = useCallback((error?: string) => {
    setReportedError(error ?? null);
    setShowDiagnostics(true);
    // Wait a frame so the section is mounted before scrolling to it.
    requestAnimationFrame(() => diagnosticsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, []);
  const diagnosticsPanelState = useMemo(
    () => ({
      selectedEventId: isEventPanelOpen ? selectedEventId : null,
      currentError: reportedError ?? auth.error ?? auth.syncStatus.error ?? null,
    }),
    [isEventPanelOpen, selectedEventId, reportedError, auth.error, auth.syncStatus.error]
  );

  // Wrapper for handleRefresh that passes current dateRange
  // Triggers both remote sync (Google API → IndexedDB) and local refresh (IndexedDB → UI)
  const handleRefreshWithDateRange = async () => {
    if (auth.isAuthenticated && auth.user?.email) {
      // First trigger incremental sync from Google Calendar API
      try {
        await chrome.runtime.sendMessage({ type: MessageType.TRIGGER_SYNC });
      } catch (error) {
        console.error('[Sidepanel] Manual sync failed:', error);
      }
      // Then refresh local data (this will also happen automatically via TRIGGER_SYNC message)
      calendarData.loadCalendarData(dateRange.dateRange);
    } else {
      calendarData.handleRefresh();
    }
  };

  // Listen for EVENT_SELECTED message
  useEffect(() => {
    const listener = (message: any) => {
      if (message.type === MessageType.EVENT_SELECTED) {
        setSelectedEventId(message.encodedEventId);
        setIsEventPanelOpen(true);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // Calculate totals for chart footer
  const totalCompleted = filtering.chartData.reduce((sum, item) => sum + item.completed, 0);
  const totalPlanned = filtering.chartData.reduce((sum, item) => sum + item.planned, 0);
  const totalHours = totalCompleted + totalPlanned;

  return (
    <DiagnosticsLauncherProvider value={openDiagnostics}>
    <div className="w-full max-w-full px-4 py-2 overflow-x-hidden box-border">
      {/* Debug, Diagnostics, and Upgrade Buttons/Content */}
      <div className="mb-4">
        {/* Buttons row - centered, side by side */}
        <div className="flex justify-center gap-2 mb-2">
          {isDev && (
            <DebugButton
              isExpanded={showDebug}
              onToggle={() => setShowDebug(!showDebug)}
            />
          )}
          <DiagnosticsButton
            isExpanded={showDiagnostics}
            onToggle={() => setShowDiagnostics(!showDiagnostics)}
          />
        </div>

        {/* Expanded content - full width */}
        {isDev && showDebug && (
          <DebugContent
            dateRange={dateRange.dateRange}
            allEvents={calendarData.allEvents}
            sortedEvents={filtering.sortedEvents}
            handleSort={filtering.handleSort}
            sortColumn={filtering.sortColumn}
            sortDirection={filtering.sortDirection}
          />
        )}
        {showDiagnostics && (
          <div ref={diagnosticsRef}>
            <DiagnosticsContent
              isAuthenticated={auth.isAuthenticated}
              panelState={diagnosticsPanelState}
            />
          </div>
        )}
      </div>

      {/* Authentication Section */}
      <AuthSection
        user={auth.user}
        isAuthenticated={auth.isAuthenticated}
        isLoading={auth.isLoading}
        error={auth.error}
        signIn={auth.signIn}
        signOut={auth.signOut}
        handleRefresh={handleRefreshWithDateRange}
        loadingCalendarData={calendarData.loadingCalendarData}
        calendarError={calendarData.calendarError}
        syncStatus={auth.syncStatus}
      />

      {/* Event Details Panel */}
      <EventDetailsPanel
        isOpen={isEventPanelOpen}
        onClose={() => setIsEventPanelOpen(false)}
        eventId={selectedEventId}
      />

      <TimeChart
        chartData={filtering.chartData}
        totalHours={totalHours}
        totalCompleted={totalCompleted}
        totalPlanned={totalPlanned}
        aggregationMode={filtering.aggregationMode}
        onAggregationModeChange={filtering.setAggregationMode}
      />

      {/* Contribution Graph */}
      {auth.isAuthenticated && (
        <ContributionGraphSection userEmail={auth.user?.email || null} calendarDateRange={dateRange.dateRange} />
      )}

      {/* Footer with links */}
      <div className="mt-6 mb-2 text-center flex flex-col items-center gap-2">
        <a
          href={COMMUNITY_INVITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
        >
          <DiscordIcon className="w-3.5 h-3.5" />
          Chat with Founder
        </a>
        <a
          href={SUPPORT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
        >
          <Heart className="w-3.5 h-3.5" />
          Support Calens
        </a>
        <a
          href="https://calens.dev/pages/privacy.html"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-500 hover:text-gray-700 underline"
        >
          Privacy Policy
        </a>
        <span className="text-xs text-gray-400">v{version}</span>
      </div>
    </div>
    </DiagnosticsLauncherProvider>
  );
}
