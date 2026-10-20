/**
 * Error Handling Utilities
 * Standardized API error handling across the extension
 */

import { diag } from './diag-log';

export interface ApiError {
  status: number;
  statusText: string;
  message: string;
  url?: string;
  body?: string;
}

/**
 * Short, non-sensitive reason from a Google API error body
 * (`error.errors[0].reason`, e.g. `notFound`, `rateLimitExceeded`). Never returns the body itself.
 */
export function googleErrorReason(body: string): string {
  try {
    const parsed = JSON.parse(body);
    const reason = parsed?.error?.errors?.[0]?.reason;
    if (typeof reason === 'string') return reason;
    const status = parsed?.error?.status;
    return typeof status === 'string' ? status : 'unknown';
  } catch {
    return 'unparseable body';
  }
}

/**
 * Handle API errors with consistent error reporting
 * @param response - The failed Response object
 * @param context - Context describing what operation failed
 * @throws Error with formatted error message
 */
export async function handleApiError(response: Response, context: string): Promise<never> {
  let errorDetail = 'No error body';
  try {
    errorDetail = await response.text();
  } catch (e) {
    errorDetail = 'Could not read error body';
  }

  const error: ApiError = {
    status: response.status,
    statusText: response.statusText,
    message: `${context} failed: ${response.status} ${response.statusText}`,
    url: response.url,
    body: errorDetail,
  };

  console.error(`[API Error] ${context}:`, {
    status: error.status,
    statusText: error.statusText,
    url: error.url,
    body: error.body,
  });
  diag('api', 'error', 'API request failed', {
    endpoint: context,
    status: error.status,
    reason: googleErrorReason(errorDetail),
  });

  throw new Error(error.message);
}

/**
 * Format an unknown error into a string message
 * @param error - The error object (unknown type)
 * @returns Formatted error message string
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Check if a response is successful, throw formatted error if not
 * @param response - The Response object to check
 * @param context - Context describing the operation
 */
export async function checkResponse(response: Response, context: string): Promise<void> {
  if (!response.ok) {
    await handleApiError(response, context);
  }
}
