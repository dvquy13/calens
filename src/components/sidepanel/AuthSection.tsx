import { Button } from '../ui/button';
import { SendReportLink } from './SendReportLink';
import { Card, CardContent } from '../ui/card';
import { GoogleIcon } from '../ui/google-icon';
import { Loader2, LogOut, RefreshCw, AlertCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import type { User } from '../../types/calendar';

export interface AuthSectionProps {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => void;
  handleRefresh: () => void;
  loadingCalendarData: boolean;
  calendarError: string | null;
  syncStatus?: {
    isLoading: boolean;
    message?: string;
    error?: string;
  };
}

export function AuthSection({
  user,
  isAuthenticated,
  isLoading,
  error,
  signIn,
  signOut,
  handleRefresh,
  loadingCalendarData,
  calendarError,
  syncStatus,
}: AuthSectionProps) {
  return (
    <Card className="bg-transparent">
      <CardContent className="pt-6">
        {isLoading ? (
          <div className="text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        ) : error ? (
          <div className="text-center space-y-3">
            <p className="text-sm text-red-600">{error}</p>
            <span className="text-red-600"><SendReportLink error={error} /></span>
            <Button
              onClick={signIn}
              className="w-full flex items-center justify-center gap-2"
              size="lg"
            >
              <GoogleIcon />
              <span>Retry Sign In</span>
            </Button>
          </div>
        ) : !isAuthenticated ? (
          <>
            <p className="text-sm mb-4">
              Get analytics and insights for your Google Calendar
            </p>
            <Button
              onClick={signIn}
              className="w-full flex items-center justify-center gap-2"
              size="lg"
            >
              <GoogleIcon />
              <span>Sign in with Google</span>
            </Button>
            <p className="text-xs text-muted-foreground mt-4">
              Signing in with Google grants Calens read access to your calendar events—this is how the extension gets your data to generate the charts and insights you see here.
              After clicking signing in you can verify the exact permissions we request via Google Authentication.
              Your calendar data stays in your browser and is never sent to any server.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              You can find more details in our{' '}
              <a
                href="https://calens.dev/privacy.html?utm_source=extension&utm_medium=signin_screen"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                Privacy Policy
              </a>
              .
            </p>
          </>
        ) : (
          <div className="text-center space-y-3">
            <div className="flex items-center gap-3">
              {user?.picture && (
                <img
                  src={user.picture}
                  alt="Profile"
                  className="w-8 h-8 rounded-full"
                />
              )}
              <div className="flex-1 text-left">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
              <TooltipProvider>
                <div className="flex gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={handleRefresh}
                        variant="outline"
                        size="sm"
                        disabled={loadingCalendarData || syncStatus?.isLoading}
                      >
                        {(loadingCalendarData || syncStatus?.isLoading) ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Sync</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={signOut}
                        variant="outline"
                        size="sm"
                      >
                        <LogOut className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Sign Out</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>
            </div>
            {syncStatus?.isLoading && syncStatus.message && (
              <div className="flex items-start gap-2 p-3 bg-brand/5 dark:bg-brand/10 border border-brand/20 dark:border-brand/30 rounded-md">
                <Loader2 className="h-4 w-4 text-brand dark:text-brand-light mt-0.5 animate-spin" />
                <p className="text-sm text-brand dark:text-brand-light">{syncStatus.message}</p>
              </div>
            )}
            {syncStatus?.error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900 rounded-md">
                <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5" />
                <div>
                  <p className="text-sm text-red-600 dark:text-red-400">Sync failed: {syncStatus.error}</p>
                  <span className="text-red-600 dark:text-red-400"><SendReportLink error={`Sync failed: ${syncStatus.error}`} /></span>
                </div>
              </div>
            )}
            {calendarError && (
              <div className="text-red-600">
                <p className="text-xs">{calendarError}</p>
                <SendReportLink error={calendarError} />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
