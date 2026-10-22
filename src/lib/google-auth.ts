// OAuth 2.0 configuration using Chrome Identity API
//
// Side-panel only (imported by useAuth): logs go through diag-panel. Never log
// the token or any Authorization header.
import { diag } from './diag-panel';
import type { GoogleCalendarEvent } from '../types/calendar';

// Note: client_id is configured in manifest.json oauth2 section
// Chrome reads it directly from there - no need to duplicate it here
export const GOOGLE_OAUTH_CONFIG = {
  scopes: [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ],
};

/**
 * Launch Chrome OAuth flow using chrome.identity.getAuthToken()
 * This is the official Chrome extension OAuth method - no PKCE or client secret needed!
 * Chrome handles the entire OAuth flow internally including token exchange and refresh.
 */
export async function launchChromeOAuthFlow(): Promise<{
  access_token: string;
  expires_at: string;
} | null> {
  try {
    console.log('[Chrome OAuth] Requesting token from chrome.identity API...');

    // Use Chrome's Identity API to get an access token
    // Chrome handles the OAuth flow, token exchange, and refresh internally
    const token = await new Promise<string>((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!token) {
          reject(new Error('No token received from chrome.identity.getAuthToken'));
        } else {
          resolve(token);
        }
      });
    });

    console.log('[Chrome OAuth] Token received successfully');
    diag('auth', 'info', 'oauth token acquired');

    // Chrome tokens typically expire after 1 hour
    // Chrome automatically handles refresh, but we track expiry for UI purposes
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    return {
      access_token: token,
      expires_at: expiresAt,
    };
  } catch (error) {
    console.error('[Chrome OAuth] OAuth flow failed:', error);
    diag('auth', 'error', 'oauth flow failed', { reason: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/**
 * Refresh access token using chrome.identity API
 * Chrome automatically handles token refresh, but we expose this for explicit refresh requests
 */
export async function refreshAccessToken(): Promise<{
  access_token: string;
  expires_at: string;
} | null> {
  try {
    console.log('[OAuth] Refreshing access token via chrome.identity...');

    // Get current cached token first
    const cachedToken = await new Promise<string | undefined>((resolve) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        resolve(token || undefined);
      });
    });

    // If we have a cached token, remove it to force Chrome to get a fresh one
    if (cachedToken) {
      await new Promise<void>((resolve, reject) => {
        chrome.identity.removeCachedAuthToken({ token: cachedToken }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve();
          }
        });
      });
    }

    // Get a fresh token (Chrome will handle refresh internally)
    const freshToken = await new Promise<string>((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!token) {
          reject(new Error('No token received from chrome.identity.getAuthToken'));
        } else {
          resolve(token);
        }
      });
    });

    console.log('[OAuth] Token refresh successful');
    diag('auth', 'info', 'token refreshed');

    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    return {
      access_token: freshToken,
      expires_at: expiresAt,
    };
  } catch (error) {
    console.error('[OAuth] Token refresh failed:', error);
    diag('auth', 'error', 'token refresh failed', { reason: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/**
 * Revoke OAuth token and clear Chrome's token cache
 * Must be called during sign-out to properly revoke access
 */
export async function revokeToken(accessToken: string): Promise<void> {
  try {
    console.log('[OAuth] Revoking token...');

    // Remove from Chrome's cache
    await new Promise<void>((resolve, reject) => {
      chrome.identity.removeCachedAuthToken({ token: accessToken }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });

    // Clear ALL cached auth tokens to allow account switching
    // This forces Chrome to show the account picker on next sign-in
    await new Promise<void>((resolve, reject) => {
      chrome.identity.clearAllCachedAuthTokens(() => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });

    // Revoke token with Google
    await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${accessToken}`, {
      method: 'POST',
    });

    console.log('[OAuth] Token revoked successfully');
  } catch (error) {
    console.error('[OAuth] Token revocation failed:', error);
    diag('auth', 'warn', 'token revocation failed', { reason: error instanceof Error ? error.message : String(error) });
    // Don't throw - revocation failure shouldn't block sign out
  }
}

/**
 * Get Google ID token for the current user
 */
export async function getGoogleIdToken(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError || !token) {
        console.error('[Google Auth] Failed to get auth token:', chrome.runtime.lastError);
        resolve(null);
        return;
      }

      // Get ID token by exchanging access token
      // For Chrome Identity API, we need to make a request to get ID token
      fetch('https://www.googleapis.com/oauth2/v3/tokeninfo', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
        .then((response) => response.json())
        .then(() => {
          // Chrome Identity API returns the token directly as ID token
          // We can use the access token as ID token for Firebase Admin verification
          resolve(token);
        })
        .catch((error) => {
          console.error('[Google Auth] Error getting ID token:', error);
          resolve(token); // Fallback to access token
        });
    });
  });
}

// Get user info using Google API
export async function getUserInfo(accessToken: string) {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error('Failed to fetch user info');
  }
  return response.json();
}

// Create authenticated Google Calendar API client (REST API calls)
export function createCalendarClient(accessToken: string) {
  // Create headers with Authorization Bearer token (best practice)
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  return {
    calendars: {
      list: async () => {
        const apiUrl = 'https://www.googleapis.com/calendar/v3/users/me/calendarList';
        console.log('[Google Calendar API] Fetching calendar list');
        console.log('[Google Calendar API] URL:', apiUrl);

        const response = await fetch(apiUrl, {
          headers,
        });
        if (!response.ok) {
          diag('api', 'error', 'calendarList failed', { endpoint: 'calendarList', status: response.status });
          throw new Error('Failed to fetch calendars');
        }
        return response.json();
      },
    },
    events: {
      list: async (calendarId: string, params?: { timeMin?: string; timeMax?: string; maxResults?: number; singleEvents?: boolean }) => {
        const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);

        // Default singleEvents to true to expand recurring events into instances
        const queryParams = {
          singleEvents: true,
          ...params,
        };

        Object.entries(queryParams).forEach(([key, value]) => {
          if (value !== undefined) {
            url.searchParams.append(key, value.toString());
          }
        });

        console.log('[Google Calendar API] Fetching events');
        console.log('[Google Calendar API] Calendar ID:', calendarId);
        console.log('[Google Calendar API] Query params:', params);
        console.log('[Google Calendar API] Full URL:', url.toString());

        const response = await fetch(url.toString(), {
          headers,
        });
        if (!response.ok) {
          diag('api', 'error', 'events.list failed', { endpoint: 'events.list', calendarId, status: response.status });
          throw new Error('Failed to fetch events');
        }
        return response.json();
      },

      get: async (calendarId: string, eventId: string) => {
        const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;

        console.log('[Google Calendar API] Fetching single event');
        console.log('[Google Calendar API] Calendar ID:', calendarId);
        console.log('[Google Calendar API] Event ID:', eventId);
        console.log('[Google Calendar API] Full URL:', url);

        const response = await fetch(url, { headers });
        if (!response.ok) {
          diag('api', 'error', 'events.get failed', { endpoint: 'events.get', calendarId, status: response.status });
          const errorText = await response.text();
          throw new Error(`Failed to fetch event: ${response.status} - ${errorText}`);
        }
        return response.json();
      },

      update: async (calendarId: string, eventId: string, event: Record<string, unknown>) => {
        const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;

        console.log('[Google Calendar API] Updating event');
        console.log('[Google Calendar API] Calendar ID:', calendarId);
        console.log('[Google Calendar API] Event ID:', eventId);
        console.log('[Google Calendar API] Full URL:', url);

        const response = await fetch(url, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(event),
        });

        if (!response.ok) {
          diag('api', 'error', 'events.patch failed', { endpoint: 'events.patch', calendarId, status: response.status });
          const errorText = await response.text();
          throw new Error(`Failed to update event: ${response.status} - ${errorText}`);
        }
        return response.json();
      },

      insert: async (calendarId: string, event: Record<string, unknown>) => {
        const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;

        console.log('[Google Calendar API] Inserting event');
        console.log('[Google Calendar API] Calendar ID:', calendarId);
        console.log('[Google Calendar API] Full URL:', url);

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(event),
        });

        if (!response.ok) {
          diag('api', 'error', 'events.insert failed', { endpoint: 'events.insert', calendarId, status: response.status });
          const errorText = await response.text();
          throw new Error(`Failed to insert event: ${response.status} - ${errorText}`);
        }
        return response.json();
      },

      // Follows nextPageToken. With maxResults set, stops once that many instances are collected,
      // so a "first instance" lookup does not page through the rest of the series.
      instances: async (
        calendarId: string,
        eventId: string,
        params?: { timeMin?: string; timeMax?: string; maxResults?: number; showDeleted?: boolean }
      ) => {
        const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}/instances`;

        console.log('[Google Calendar API] Fetching event instances');
        console.log('[Google Calendar API] Calendar ID:', calendarId);
        console.log('[Google Calendar API] Event ID:', eventId);

        const items: GoogleCalendarEvent[] = [];
        let pageToken: string | undefined;
        do {
          const url = new URL(baseUrl);
          Object.entries(params ?? {}).forEach(([key, value]) => {
            if (value !== undefined) {
              url.searchParams.append(key, value.toString());
            }
          });
          if (pageToken) {
            url.searchParams.append('pageToken', pageToken);
          }

          const response = await fetch(url.toString(), { headers });
          if (!response.ok) {
            diag('api', 'error', 'events.instances failed', { endpoint: 'events.instances', calendarId, status: response.status });
            const errorText = await response.text();
            throw new Error(`Failed to fetch event instances: ${response.status} - ${errorText}`);
          }
          const page = await response.json();
          items.push(...(page.items ?? []));
          pageToken = page.nextPageToken;
        } while (pageToken && (params?.maxResults === undefined || items.length < params.maxResults));

        return params?.maxResults === undefined ? items : items.slice(0, params.maxResults);
      },
    },
  };
}
