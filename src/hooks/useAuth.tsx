import { useState, useEffect, useCallback, useMemo, createContext, useContext, type ReactNode } from 'react';
import {
  launchChromeOAuthFlow,
  getUserInfo,
  refreshAccessToken,
  revokeToken,
  createCalendarClient
} from '../lib/google-auth';
import { MessageType } from '../lib/message-types';
import { diag } from '../lib/diag-panel';

interface User {
  email: string;
  name: string;
  picture?: string;
}

interface SyncStatus {
  isLoading: boolean;
  message?: string;
  error?: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  tokenExpiresAt: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  syncStatus: SyncStatus;
}

export interface UseAuthReturn extends AuthState {
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshAuth: () => Promise<boolean>;
  createCalendarService: () => ReturnType<typeof createCalendarClient> | null;
}

// Create context with null as default (will throw if used outside provider)
const AuthContext = createContext<UseAuthReturn | null>(null);

// Storage keys
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'google_access_token',
  USER: 'google_user',
  EXPIRES_AT: 'google_token_expires_at',
} as const;

// Internal hook implementation - not exported directly
function useAuthInternal(): UseAuthReturn {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    accessToken: null,
    tokenExpiresAt: null,
    isLoading: true,
    isAuthenticated: false,
    error: null,
    syncStatus: { isLoading: false },
  });

  // Update isAuthenticated when user/token changes
  const isAuthenticated = !!(authState.user && authState.accessToken);

  // Load saved auth state from Chrome storage
  const loadAuthState = useCallback(async () => {
    try {
      const result = await chrome.storage.local.get([
        STORAGE_KEYS.ACCESS_TOKEN,
        STORAGE_KEYS.USER,
        STORAGE_KEYS.EXPIRES_AT,
      ]);

      if (result[STORAGE_KEYS.ACCESS_TOKEN] && result[STORAGE_KEYS.USER]) {
        const user = JSON.parse(result[STORAGE_KEYS.USER]);

        // Check if token needs refresh BEFORE setting state
        let accessToken = result[STORAGE_KEYS.ACCESS_TOKEN];
        let expiresAt = result[STORAGE_KEYS.EXPIRES_AT];

        if (result[STORAGE_KEYS.EXPIRES_AT]) {
          const expiresAtDate = new Date(result[STORAGE_KEYS.EXPIRES_AT]);
          const now = new Date();
          const timeUntilExpiry = expiresAtDate.getTime() - now.getTime();

          // Refresh if token expires in less than 10 minutes
          if (timeUntilExpiry < 10 * 60 * 1000) {
            console.log('[Auth] Token expires soon, refreshing via Chrome Identity API...');
            try {
              const newTokens = await refreshAccessToken();
              if (newTokens) {
                accessToken = newTokens.access_token;
                expiresAt = newTokens.expires_at;
                // Save updated token directly to storage
                await chrome.storage.local.set({
                  [STORAGE_KEYS.ACCESS_TOKEN]: accessToken,
                  [STORAGE_KEYS.USER]: JSON.stringify(user),
                  [STORAGE_KEYS.EXPIRES_AT]: expiresAt,
                });
              }
            } catch (error) {
              console.error('[Auth] Failed to refresh token on load:', error);
              diag('auth', 'error', 'token refresh on load failed', { reason: error instanceof Error ? error.message : String(error) });
              // Continue with existing token
            }
          }
        }

        setAuthState(prev => ({
          ...prev,
          accessToken,
          user,
          tokenExpiresAt: expiresAt,
          isLoading: false,
          error: null,
        }));
      } else {
        setAuthState(prev => ({ ...prev, isLoading: false }));
      }
    } catch (error) {
      console.error('[Auth] Error loading auth state:', error);
      diag('auth', 'error', 'auth state load failed', { reason: error instanceof Error ? error.message : String(error) });
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to load authentication state',
      }));
    }
  }, []);

  // Save auth state to Chrome storage
  const saveAuthState = useCallback(async (
    accessToken: string,
    user: User,
    expiresAt: string
  ) => {
    await chrome.storage.local.set({
      [STORAGE_KEYS.ACCESS_TOKEN]: accessToken,
      [STORAGE_KEYS.USER]: JSON.stringify(user),
      [STORAGE_KEYS.EXPIRES_AT]: expiresAt,
    });
  }, []);

  // Clear auth state from Chrome storage
  const clearAuthState = useCallback(async () => {
    await chrome.storage.local.remove([
      STORAGE_KEYS.ACCESS_TOKEN,
      STORAGE_KEYS.USER,
      STORAGE_KEYS.EXPIRES_AT,
    ]);
  }, []);

  // Complete sign-in after obtaining a token (shared by signIn and checkPendingAuth)
  const completeSignIn = useCallback(async (accessToken: string, expiresAt: string) => {
    // Get user info
    const userInfo = await getUserInfo(accessToken);

    const user: User = {
      email: userInfo.email || '',
      name: userInfo.name || '',
      picture: userInfo.picture || undefined,
    };

    // Save to storage
    await saveAuthState(accessToken, user, expiresAt);

    // Update state
    setAuthState({
      accessToken,
      user,
      tokenExpiresAt: expiresAt,
      isLoading: false,
      isAuthenticated: true,
      error: null,
      syncStatus: { isLoading: false },
    });

    console.log('[Auth] Sign in successful');
    diag('auth', 'info', 'sign-in complete');

    // Trigger initial sync
    try {
      const response = await chrome.runtime.sendMessage({
        type: MessageType.INITIAL_SYNC,
        userEmail: user.email,
      });

      if (!response.success) {
        throw new Error(response.error);
      }
    } catch (syncError) {
      console.error('[Auth] Initial sync failed:', syncError);
      diag('sync', 'error', 'initial sync failed in panel', { reason: syncError instanceof Error ? syncError.message : String(syncError) });
      setAuthState(prev => ({
        ...prev,
        syncStatus: {
          isLoading: false,
          error: syncError instanceof Error ? syncError.message : 'Sync failed',
        },
      }));
    }
  }, [saveAuthState]);

  // Sign in using Chrome OAuth flow
  const signIn = useCallback(async () => {
    try {
      setAuthState(prev => ({ ...prev, isLoading: true, error: null }));

      const tokens = await launchChromeOAuthFlow();

      if (!tokens) {
        throw new Error('Failed to obtain tokens');
      }

      await completeSignIn(tokens.access_token, tokens.expires_at);
    } catch (error) {
      console.error('[Auth] Sign in failed:', error);
      diag('auth', 'error', 'sign-in failed', { reason: error instanceof Error ? error.message : String(error) });
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Sign in failed',
      }));
    }
  }, [completeSignIn]);

  // Sign out
  const signOut = useCallback(async () => {
    try {
      const userEmail = authState.user?.email;

      // Revoke token with Chrome and Google
      if (authState.accessToken) {
        await revokeToken(authState.accessToken);
      }

      // Clear sync checkpoints to force full sync on next login
      if (userEmail) {
        try {
          await chrome.runtime.sendMessage({
            type: MessageType.CLEAR_SYNC_CHECKPOINTS,
            userEmail,
          });
          console.log('[Auth] Cleared sync checkpoints');
        } catch (error) {
          console.error('[Auth] Failed to clear sync checkpoints:', error);
        }
      }

      await clearAuthState();
      setAuthState({
        user: null,
        accessToken: null,
        tokenExpiresAt: null,
        isLoading: false,
        isAuthenticated: false,
        error: null,
        syncStatus: { isLoading: false },
      });
      console.log('[Auth] Sign out successful');
    } catch (error) {
      console.error('[Auth] Sign out failed:', error);
    }
  }, [authState.accessToken, authState.user?.email, clearAuthState]);

  // Refresh tokens using Chrome Identity API
  const refreshAuth = useCallback(async (): Promise<boolean> => {
    try {
      console.log('[Auth] Refreshing token via chrome.identity...');

      const newTokens = await refreshAccessToken();

      if (!newTokens) {
        throw new Error('Failed to refresh tokens');
      }

      // Save updated token
      if (authState.user) {
        await saveAuthState(
          newTokens.access_token,
          authState.user,
          newTokens.expires_at
        );

        // Update state
        setAuthState(prev => ({
          ...prev,
          accessToken: newTokens.access_token,
          tokenExpiresAt: newTokens.expires_at,
          error: null,
        }));
      }

      console.log('[Auth] Token refresh successful');
      return true;
    } catch (error) {
      console.error('[Auth] Token refresh failed:', error);
      setAuthState(prev => ({
        ...prev,
        error: 'Failed to refresh authentication. Please sign in again.',
      }));

      // Clear invalid tokens after a delay
      setTimeout(() => {
        signOut();
      }, 2000);

      return false;
    }
  }, [authState.user, saveAuthState, signOut]);

  // Create calendar service
  const createCalendarService = useCallback(() => {
    if (!authState.accessToken) {
      return null;
    }

    return createCalendarClient(authState.accessToken);
  }, [authState.accessToken]);

  // Load auth state on mount
  useEffect(() => {
    loadAuthState();
  }, [loadAuthState]);

  // Check for pending OAuth completion when sidepanel regains visibility
  // This handles the case where chrome.identity.getAuthToken callback doesn't fire
  // after the OAuth popup closes (common issue with sidepanels)
  useEffect(() => {
    const checkPendingAuth = async () => {
      // Only check if we're not loading and not authenticated
      if (authState.isLoading || authState.accessToken) {
        return;
      }

      try {
        // Check if Chrome has a cached token we haven't processed
        const cachedToken = await new Promise<string | undefined>((resolve) => {
          chrome.identity.getAuthToken({ interactive: false }, (token) => {
            if (chrome.runtime.lastError || !token) {
              resolve(undefined);
            } else {
              resolve(token);
            }
          });
        });

        // If we have a cached token but no auth state, complete the sign-in
        if (cachedToken) {
          console.log('[Auth] Found pending OAuth token, completing sign-in...');
          diag('auth', 'info', 'pending OAuth token adopted');
          const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
          await completeSignIn(cachedToken, expiresAt);
        }
      } catch (error) {
        console.error('[Auth] Error checking pending auth:', error);
        diag('auth', 'error', 'pending auth check failed', { reason: error instanceof Error ? error.message : String(error) });
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkPendingAuth();
      }
    };

    // Check immediately and also on visibility change
    checkPendingAuth();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [authState.isLoading, authState.accessToken, completeSignIn]);

  // Listen for sync lifecycle messages
  useEffect(() => {
    const handleMessages = (message: any) => {
      if (message.type === MessageType.SYNC_STARTED) {
        // Only show message text for initial sync (first login)
        const shouldShowMessage = message.syncType === 'initial';

        setAuthState(prev => ({
          ...prev,
          syncStatus: {
            isLoading: true,
            message: shouldShowMessage ? 'Syncing calendar data...' : undefined
          }
        }));
      } else if (message.type === MessageType.SYNC_COMPLETE) {
        setAuthState(prev => ({
          ...prev,
          syncStatus: { isLoading: false, message: 'Sync complete' }
        }));

        // Clear success message after 2s
        setTimeout(() => {
          setAuthState(prev => ({
            ...prev,
            syncStatus: { isLoading: false }
          }));
        }, 2000);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessages);
    return () => chrome.runtime.onMessage.removeListener(handleMessages);
  }, []);

  // Memoize return value to prevent unnecessary re-renders from object reference changes
  // Only depend on actual state values, not callbacks (callbacks are stable via useCallback)
  return useMemo(() => ({
    ...authState,
    isAuthenticated,
    signIn,
    signOut,
    refreshAuth,
    createCalendarService,
  }), [
    authState.user,
    authState.accessToken,
    authState.tokenExpiresAt,
    authState.isLoading,
    authState.error,
    authState.syncStatus,
    isAuthenticated,
  ]);
}

// Provider component - wraps the app and provides auth context
export function AuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuthInternal();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

// Hook to consume the auth context
export function useAuth(): UseAuthReturn {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}