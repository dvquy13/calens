/**
 * Sends a diagnostics report to the submitDiagnostics Cloud Function.
 * Server error messages are surfaced verbatim.
 */

import { getGoogleIdToken } from './google-auth';
import type { DiagnosticsReport } from '../background/diagnostics-report';

export interface SubmitResult {
  reportId: string;
  discordFailed: boolean;
}

const SUBMIT_DIAGNOSTICS_URL = 'https://us-central1-calens-chrome-ext.cloudfunctions.net/submitDiagnostics';

export async function submitDiagnostics(report: DiagnosticsReport, note?: string): Promise<SubmitResult> {
  const idToken = await getGoogleIdToken();
  if (!idToken) throw new Error('Could not get a Google token. Please sign in again.');

  const response = await fetch(SUBMIT_DIAGNOSTICS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, report, note: note || undefined }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? `Report failed (HTTP ${response.status})`);
  if (typeof body?.reportId !== 'string') throw new Error('Unexpected response from the report server');
  return { reportId: body.reportId, discordFailed: body.discord === 'failed' };
}
