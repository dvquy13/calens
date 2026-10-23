import { diag } from './diag-panel';

const ACTIVE_DAY_URL = 'https://wzacvfhfpqhdutqfcofz.supabase.co/rest/v1/rpc/record_active_day';
// Public by design (Supabase publishable key). active_pings is private; writes go only
// through the record_active_day RPC.
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_lP5YMdKYfZ3IvLntTV_zBg_gJdYYkNh';

const INSTALL_ID_KEY = 'calensInstallId';
const ACTIVE_PING_DAY_KEY = 'activePingDay';

/**
 * Counts weekly active users: at most one request per UTC day, when the side panel opens.
 * Sends only a random install ID and the extension version, nothing about the user. The server
 * ignores duplicates for the same install and day. See docs/patterns-and-decisions.md.
 * Never rejects, so a failed ping cannot break the panel; a failure is retried on the next open.
 */
export async function recordActiveDay(): Promise<void> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const stored = await chrome.storage.local.get([INSTALL_ID_KEY, ACTIVE_PING_DAY_KEY]);
    if (stored[ACTIVE_PING_DAY_KEY] === today) return;

    let installId = stored[INSTALL_ID_KEY] as string | undefined;
    if (!installId) {
      installId = crypto.randomUUID();
      await chrome.storage.local.set({ [INSTALL_ID_KEY]: installId });
    }

    const response = await fetch(ACTIVE_DAY_URL, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_install_id: installId, p_version: chrome.runtime.getManifest().version }),
    });

    if (!response.ok) {
      diag('fetch', 'warn', 'Active-day ping failed', { status: response.status });
      return;
    }
    await chrome.storage.local.set({ [ACTIVE_PING_DAY_KEY]: today });
  } catch (error) {
    diag('fetch', 'warn', 'Active-day ping failed', {
      error: error instanceof Error ? error.name : 'unknown',
    });
  }
}
