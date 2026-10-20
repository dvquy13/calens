import { Fragment, useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Textarea } from '../ui/textarea';
import { Bug, ArrowUpDown, Stethoscope } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TimeEntry, DateRangeMessage } from '../../types/calendar';
import type { SortColumn } from '../../hooks/useEventFiltering';
import { MessageType } from '../../lib/message-types';
import { DIAG_CATS, DIAG_LEVELS, DIAG_STORAGE_KEY, getDiagEntries, type DiagCat, type DiagEntry, type DiagLevel } from '../../lib/diag-log';
import type { DiagnosticsPanelState, DiagnosticsReport } from '../../background/diagnostics-report';
import { submitDiagnostics, type SubmitResult } from '../../lib/diagnostics-submit';
import { clearDiagLog } from '../../lib/diag-panel';

export interface DebugButtonProps {
  isExpanded: boolean;
  onToggle: () => void;
}

export interface DebugContentProps {
  dateRange: DateRangeMessage['dateRange'] | null;
  allEvents: TimeEntry[];
  sortedEvents: TimeEntry[];
  handleSort: (column: SortColumn) => void;
  sortColumn: SortColumn;
  sortDirection: 'asc' | 'desc';
}

export function DebugButton({ isExpanded, onToggle }: DebugButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onToggle}
      className={cn(
        "h-6 px-2 text-xs",
        isExpanded && "bg-accent"
      )}
    >
      <Bug className="h-3 w-3 mr-1" />
      Debug
    </Button>
  );
}

export function DebugContent({
  dateRange,
  allEvents,
  sortedEvents,
  handleSort,
}: DebugContentProps) {
  return (
    <Card className="text-xs bg-transparent">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs">Debug Information</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <div>
          <p className="font-semibold">Date Range:</p>
          <p className="text-muted-foreground">
            {dateRange ? (
              <>
                Start: {new Date(dateRange.startDate).toLocaleString()}<br />
                End: {new Date(dateRange.endDate).toLocaleString()}
              </>
            ) : (
              'No date range available'
            )}
          </p>
        </div>
        <div>
          <p className="font-semibold mb-2">Events ({allEvents.length}):</p>
          {allEvents.length > 0 ? (
            <div className="max-h-96 overflow-x-auto overflow-y-auto border rounded-md">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead className="min-w-[120px]">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-1 text-xs font-medium hover:bg-muted/50 border-0 whitespace-nowrap"
                        onClick={() => handleSort('title')}
                      >
                        Title
                        <ArrowUpDown className="ml-1 h-3 w-3" />
                      </Button>
                    </TableHead>
                    <TableHead className="min-w-[100px]">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-1 text-xs font-medium hover:bg-muted/50 border-0 whitespace-nowrap"
                        onClick={() => handleSort('calendarName')}
                      >
                        Calendar
                        <ArrowUpDown className="ml-1 h-3 w-3" />
                      </Button>
                    </TableHead>
                    <TableHead className="min-w-[100px]">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-1 text-xs font-medium hover:bg-muted/50 border-0 whitespace-nowrap"
                        onClick={() => handleSort('startTime')}
                      >
                        Start Time
                        <ArrowUpDown className="ml-1 h-3 w-3" />
                      </Button>
                    </TableHead>
                    <TableHead className="min-w-[60px] text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-1 text-xs font-medium hover:bg-muted/50 border-0 whitespace-nowrap"
                        onClick={() => handleSort('durationMinutes')}
                      >
                        Hours
                        <ArrowUpDown className="ml-1 h-3 w-3" />
                      </Button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedEvents.map((event, idx) => (
                    <TableRow key={idx} className="text-xs">
                      <TableCell className="font-medium max-w-[150px] truncate py-1" title={event.title}>
                        {event.title}
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate py-1" title={event.calendarName}>
                        {event.calendarName}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap py-1">
                        {new Date(event.startTime).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap py-1">
                        {(event.durationMinutes / 60).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-muted-foreground">No events loaded</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export interface DiagnosticsButtonProps {
  isExpanded: boolean;
  onToggle: () => void;
}

export function DiagnosticsButton({ isExpanded, onToggle }: DiagnosticsButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onToggle}
      className={cn(
        "h-6 px-2 text-xs",
        isExpanded && "bg-accent"
      )}
    >
      <Stethoscope className="h-3 w-3 mr-1" />
      Diagnostics
    </Button>
  );
}

export interface DiagnosticsContentProps {
  isAuthenticated: boolean;
  /** Context attached to the report: the open event and the error being reported. */
  panelState: DiagnosticsPanelState;
}

const LEVEL_STYLE: Record<DiagLevel, string> = {
  info: 'text-muted-foreground',
  warn: 'text-amber-600 dark:text-amber-400',
  error: 'text-red-600 dark:text-red-400',
};

const SELECT_CLASS = 'h-6 rounded-md border border-input bg-background px-1 text-xs';

/** Exported for tests. An undefined response means no listener answered (stale service worker after a rebuild). */
export async function fetchReport(panelState: DiagnosticsPanelState): Promise<DiagnosticsReport> {
  const response = await chrome.runtime.sendMessage({ type: MessageType.GET_DIAGNOSTICS_REPORT, panelState });
  if (response === undefined) {
    throw new Error("Calens' background service didn't respond. Reload the extension in chrome://extensions and try again.");
  }
  if (!response?.success) throw new Error(response?.error ?? 'Failed to build diagnostics report');
  return response.data;
}

type SendState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; result: SubmitResult }
  | { kind: 'error'; message: string };

/**
 * Diagnostics section: status summary, live filterable log, and report
 * actions (send to the Calens team, copy, clear). Always visible (not
 * dev-gated), since field issues can't always be reproduced on a dev machine.
 */
export function DiagnosticsContent({ isAuthenticated, panelState }: DiagnosticsContentProps) {
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [entries, setEntries] = useState<DiagEntry[]>([]);
  const [levelFilter, setLevelFilter] = useState<DiagLevel | 'all'>('all');
  const [catFilter, setCatFilter] = useState<DiagCat | 'all'>('all');
  const [note, setNote] = useState('');
  const [send, setSend] = useState<SendState>({ kind: 'idle' });
  const [copyLabel, setCopyLabel] = useState('Copy');
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    const load = () => {
      getDiagEntries().then(setEntries).catch((e) => setActionError(String(e?.message ?? e)));
      fetchReport(panelState).then(setReport).catch((e) => setActionError(String(e?.message ?? e)));
    };
    load();
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' || !(DIAG_STORAGE_KEY in changes)) return;
      setEntries((changes[DIAG_STORAGE_KEY].newValue as DiagEntry[] | undefined) ?? []);
      window.clearTimeout(timer);
      timer = window.setTimeout(load, 500); // refresh the summary once the log settles
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      window.clearTimeout(timer);
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, [panelState.selectedEventId, panelState.currentError]);

  const visible = entries
    .filter((e) => (levelFilter === 'all' || e.level === levelFilter) && (catFilter === 'all' || e.cat === catFilter))
    .reverse();

  const handleSend = async () => {
    setSend({ kind: 'sending' });
    try {
      const result = await submitDiagnostics(await fetchReport(panelState), note.trim());
      setSend({ kind: 'sent', result });
    } catch (e) {
      setSend({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  const handleCopy = async () => {
    try {
      const full = await fetchReport(panelState);
      await navigator.clipboard.writeText(JSON.stringify({ ...full, note: note.trim() || undefined }, null, 2));
      setActionError(null);
      setCopyLabel('Copied!');
      setTimeout(() => setCopyLabel('Copy'), 1500);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleClear = async () => {
    try {
      await clearDiagLog();
      setActionError(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const calendars = report?.calendars.filter((c) => c.selected) ?? [];
  const newestSync = calendars.reduce<string | null>((m, c) => (c.last_sync && (!m || c.last_sync > m) ? c.last_sync : m), null);
  const calendarSummary = calendars.length === 0
    ? '—'
    : `${calendars.length} calendar${calendars.length === 1 ? '' : 's'} · ${newestSync ? `last sync ${new Date(newestSync).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'never synced'}`;

  return (
    <Card className="text-xs bg-transparent" data-testid="diagnostics-section">
      <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-xs">Diagnostics</CardTitle>
        {report && (
          <div className="flex gap-1">
            <Badge variant="outline">v{report.env.version}</Badge>
            <Badge variant="outline">{report.env.mode === 'development' ? 'dev' : 'prod'}</Badge>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-muted-foreground">
          <span>Signed in</span>
          <span>{isAuthenticated ? report?.user.email ?? 'Yes' : 'No'}</span>
          <span>Calendars</span>
          <span>{calendarSummary}</span>
        </div>
        {calendars.length > 0 && (
          <details className="text-muted-foreground">
            <summary className="cursor-pointer">Per-calendar sync</summary>
            <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 mt-1">
              {calendars.map((c) => (
                <Fragment key={c.label}>
                  <span className="truncate" title={c.label}>{c.label}</span>
                  <span>{c.last_sync ? new Date(c.last_sync).toLocaleString() : 'never synced'}</span>
                </Fragment>
              ))}
            </div>
          </details>
        )}

        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="font-semibold">Log ({visible.length})</p>
            <div className="flex gap-1">
              <select
                aria-label="Filter by level"
                className={SELECT_CLASS}
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value as DiagLevel | 'all')}
              >
                <option value="all">All levels</option>
                {DIAG_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <select
                aria-label="Filter by category"
                className={SELECT_CLASS}
                value={catFilter}
                onChange={(e) => setCatFilter(e.target.value as DiagCat | 'all')}
              >
                <option value="all">All categories</option>
                {DIAG_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          {visible.length > 0 ? (
            <div className="max-h-64 overflow-y-auto border rounded-md divide-y">
              {visible.map((entry, idx) => (
                <div key={idx} className="px-2 py-1 flex gap-2" title={entry.data ? JSON.stringify(entry.data) : undefined}>
                  <span className="text-muted-foreground whitespace-nowrap">{new Date(entry.t).toLocaleTimeString()}</span>
                  <span className={cn('whitespace-nowrap font-medium', LEVEL_STYLE[entry.level])}>{entry.ctx}/{entry.cat}</span>
                  <span className="break-words min-w-0">{entry.msg}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No log entries</p>
          )}
        </div>

        <Textarea
          aria-label="What happened?"
          placeholder="What happened? (optional)"
          className="min-h-[60px] text-xs"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <div className="flex items-center gap-2">
          <Button size="sm" className="h-6 px-2 text-xs" disabled={!isAuthenticated || send.kind === 'sending'} onClick={handleSend}>
            {send.kind === 'sending' ? 'Sending…' : 'Send report'}
          </Button>
          <Button variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={handleCopy}>{copyLabel}</Button>
          <Button variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={handleClear}>Clear</Button>
        </div>
        {!isAuthenticated && (
          <p className="text-muted-foreground">Sign in to send; use Copy instead.</p>
        )}
        {send.kind === 'sent' && (
          <p>
            Sent: <span className="select-all font-mono">{send.result.reportId}</span>
            {send.result.discordFailed && <span className="text-muted-foreground"> (saved, but the Discord notification failed)</span>}
          </p>
        )}
        {send.kind === 'error' && <p role="alert" className="text-red-600 dark:text-red-400">{send.message}</p>}
        {actionError && <p role="alert" className="text-red-600 dark:text-red-400">{actionError}</p>}
      </CardContent>
    </Card>
  );
}
