import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CalendarService, SyncTokenExpiredError } from './calendar-service';

vi.mock('./diag-log', () => ({ diag: vi.fn() }));

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('CalendarService.getEvents', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * Regression: getEvents made one request and never followed nextPageToken, so
   * incremental sync lost every event past the first page (maxResults: 500).
   */
  it('returns items from every page and sends pageToken on the follow-up request', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: 'a' }, { id: 'b' }], nextPageToken: 'page-2' }))
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: 'c' }] }));

    const service = new CalendarService(async () => 'token');
    const result = await service.getEvents('cal@example.com', { maxResults: 2 });

    expect(result.items.map((e: { id: string }) => e.id)).toEqual(['a', 'b', 'c']);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstUrl = new URL(fetchMock.mock.calls[0][0] as string);
    const secondUrl = new URL(fetchMock.mock.calls[1][0] as string);
    expect(firstUrl.searchParams.has('pageToken')).toBe(false);
    expect(secondUrl.searchParams.get('pageToken')).toBe('page-2');
    expect(secondUrl.searchParams.get('maxResults')).toBe('2');
  });

  it('returns the last page\'s nextSyncToken', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: 'a' }], nextPageToken: 'page-2' }))
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: 'b' }], nextSyncToken: 'sync-1' }));

    const service = new CalendarService(async () => 'token');
    const result = await service.getEvents('cal@example.com', { timeMin: '2026-01-01T00:00:00Z' });

    expect(result.nextSyncToken).toBe('sync-1');
  });

  it('sends syncToken without any of the parameters Google rejects alongside it', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [], nextSyncToken: 'sync-2' }));

    const service = new CalendarService(async () => 'token');
    await service.getEvents('cal@example.com', { syncToken: 'sync-1', singleEvents: true, maxResults: 2500 });

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get('syncToken')).toBe('sync-1');
    for (const name of ['timeMin', 'timeMax', 'updatedMin', 'orderBy']) {
      expect(url.searchParams.has(name)).toBe(false);
    }
  });

  it('throws SyncTokenExpiredError on 410', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 410, message: 'Gone' } }), { status: 410 })
    );

    const service = new CalendarService(async () => 'token');
    await expect(service.getEvents('cal@example.com', { syncToken: 'stale' }))
      .rejects.toBeInstanceOf(SyncTokenExpiredError);
  });
});
