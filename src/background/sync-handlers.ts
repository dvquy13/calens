/**
 * Sync Handlers
 * Handles sync orchestration requests
 */

import { MessageType } from '../lib/message-types';
import { SyncService } from '../lib/sync/sync-service';
import { diag } from '../lib/diag-log';

export async function handleInitialSync(
  message: any,
  sendResponse: (response: any) => void,
  syncService: SyncService
): Promise<void> {
  try {
    chrome.runtime.sendMessage({
      type: MessageType.SYNC_STARTED,
      syncType: 'initial'
    }).catch(() => {});

    await syncService.performInitialSync(message.userEmail);

    chrome.runtime.sendMessage({ type: MessageType.SYNC_COMPLETE }).catch(() => {
      // Sidepanel not open, ignore
    });

    sendResponse({ success: true });
  } catch (error) {
    console.error('[Background] Initial sync failed:', error);

    sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

export async function handleManualSync(
  message: any,
  sendResponse: (response: any) => void,
  syncService: SyncService
): Promise<void> {
  try {
    const storage = await chrome.storage.local.get('google_user');
    const user = storage.google_user ? JSON.parse(storage.google_user) : null;
    const userEmail = user?.email;

    if (!userEmail) {
      diag('auth', 'warn', 'manual sync skipped: not signed in');
      throw new Error('Not authenticated');
    }

    chrome.runtime.sendMessage({
      type: MessageType.SYNC_STARTED,
      syncType: 'manual'
    }).catch(() => {});

    // Use targetCalendarIds if provided by content script
    await syncService.performIncrementalSync(userEmail, message.targetCalendarIds);

    chrome.runtime.sendMessage({ type: MessageType.SYNC_COMPLETE }).catch(() => {
      // Sidepanel not open, ignore
    });

    sendResponse({ success: true });
  } catch (error) {
    console.error('[Background] Manual sync failed:', error);

    sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
}
