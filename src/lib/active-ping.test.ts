import { describe, it, expect, beforeEach, vi } from 'vitest';
import { recordActiveDay } from './active-ping';
import { diag } from './diag-panel';

vi.mock('./diag-panel', () => ({ diag: vi.fn() }));

const URL_ = 'https://wzacvfhfpqhdutqfcofz.supabase.co/rest/v1/rpc/record_active_day';

let store: Record<string, unknown>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  store = {};
  vi.mocked(diag).mockClear();
  vi.stubGlobal('chrome', {
    runtime: { getManifest: () => ({ version: '0.0.4.0' }) },
    storage: {
      local: {
        get: vi.fn(async (keys: string[]) =>
          Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, structuredClone(store[k])]))),
        set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(store, structuredClone(items)); }),
      },
    },
  });
  fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-24T12:00:00Z'));
});

describe('recordActiveDay', () => {
  it('creates an install ID, sends one request, and stores the UTC day', async () => {
    await recordActiveDay();

    expect(store.calensInstallId).toMatch(/^[0-9a-f-]{36}$/);
    expect(store.activePingDay).toBe('2026-10-24');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(URL_);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      apikey: 'sb_publishable_lP5YMdKYfZ3IvLntTV_zBg_gJdYYkNh',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body as string)).toEqual({
      p_install_id: store.calensInstallId,
      p_version: '0.0.4.0',
    });
  });

  it('sends nothing when already pinged today', async () => {
    store = { calensInstallId: 'existing-id', activePingDay: '2026-10-24' };
    await recordActiveDay();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not store the day on a non-ok response and logs the status only', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(recordActiveDay()).resolves.toBeUndefined();

    expect(store.activePingDay).toBeUndefined();
    expect(diag).toHaveBeenCalledWith('fetch', 'warn', 'Active-day ping failed', { status: 500 });
  });

  it('does not store the day or reject on a thrown fetch error, and logs the error name only', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(recordActiveDay()).resolves.toBeUndefined();

    expect(store.activePingDay).toBeUndefined();
    expect(diag).toHaveBeenCalledWith('fetch', 'warn', 'Active-day ping failed', { error: 'TypeError' });
  });

  it('sends again on a new UTC day with the same install ID', async () => {
    await recordActiveDay();
    const installId = store.calensInstallId;

    vi.setSystemTime(new Date('2026-10-25T00:30:00Z'));
    await recordActiveDay();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(store.activePingDay).toBe('2026-10-25');
    const body = JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string);
    expect(body.p_install_id).toBe(installId);
  });
});
