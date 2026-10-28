/**
 * Google Calendar API Service
 * Wrapper for making authenticated requests to Google Calendar API
 */

import { diag } from './diag-log';
import { googleErrorReason } from './error-utils';

/** events.list rejected a stored sync token (HTTP 410): the caller must do a full sync. */
export class SyncTokenExpiredError extends Error {
  constructor(calendarId: string) {
    super(`Sync token expired for ${calendarId}`);
    this.name = 'SyncTokenExpiredError';
  }
}

export class CalendarService {
  constructor(private getToken: () => Promise<string>) {}

  /**
   * Fetch with automatic token refresh on 401 errors
   */
  private async fetchWithTokenRefresh(url: string, options: RequestInit = {}): Promise<Response> {
    let token = await this.getToken();
    let response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`
      }
    });

    // If 401, try refreshing token once
    if (response.status === 401) {
      console.log('[CalendarService] Token expired, refreshing...');
      diag('auth', 'info', 'token rejected (401), refreshing');
      token = await this.getToken(); // Force new token
      response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${token}`
        }
      });
    }

    return response;
  }

  /**
   * Fetch user's calendar list
   */
  async getCalendars(): Promise<any[]> {
    const response = await this.fetchWithTokenRefresh(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList'
    );
    if (!response.ok) {
      const errorText = await response.text();
      diag('api', 'error', 'calendarList failed', {
        endpoint: 'calendarList',
        status: response.status,
        reason: googleErrorReason(errorText),
      });
      throw new Error(`Failed to fetch calendars: ${response.status} ${errorText}`);
    }
    const data = await response.json();
    return data.items || [];
  }

  /**
   * Fetch all events from a calendar with optional filters, following nextPageToken.
   * `maxResults` is the per-page size, not a cap on the total.
   * `nextSyncToken` (last page only) feeds a later call's `syncToken`; Google rejects
   * `syncToken` combined with `timeMin`/`timeMax`/`updatedMin`/`orderBy`.
   */
  async getEvents(calendarId: string, params: {
    timeMin?: string;
    timeMax?: string;
    updatedMin?: string;
    orderBy?: string;
    singleEvents?: boolean;
    maxResults?: number;
    syncToken?: string;
  }): Promise<{ items: any[]; nextSyncToken?: string }> {
    const items: any[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;

    do {
      const queryParams = new URLSearchParams();
      Object.entries({ ...params, pageToken }).forEach(([key, value]) => {
        if (value !== undefined) queryParams.set(key, String(value));
      });

      const response = await this.fetchWithTokenRefresh(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${queryParams}`
      );
      if (response.status === 410) {
        diag('api', 'warn', 'sync token expired', { calendarId });
        throw new SyncTokenExpiredError(calendarId);
      }
      if (!response.ok) {
        const errorText = await response.text();
        diag('api', 'error', 'events.list failed', {
          endpoint: 'events.list',
          calendarId,
          status: response.status,
          reason: googleErrorReason(errorText),
        });
        throw new Error(`Failed to fetch events for ${calendarId}: ${response.status} ${errorText}`);
      }
      const page = await response.json();
      items.push(...(page.items ?? []));
      pageToken = page.nextPageToken;
      nextSyncToken = page.nextSyncToken;
    } while (pageToken);

    return { items, nextSyncToken };
  }
}
