import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CalendarService } from './calendar-service';

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
});
