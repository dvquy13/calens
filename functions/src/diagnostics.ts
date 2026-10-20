import * as crypto from "crypto";
import * as admin from "firebase-admin";
import * as logger from "firebase-functions/logger";
import {GoogleTokenInfo, isEmailVerified} from "./auth";

/**
 * submitDiagnostics logic, kept free of Firebase runtime globals so it can be
 * unit-tested with injected dependencies (see diagnostics.test.ts).
 *
 * Storage decision: `diagnosticReports/{id}.report` is stored as a JSON
 * *string*, not a nested map. Firestore caps documents at 1 MiB, nesting
 * depth at 20 and forbids nested arrays/undefined, none of which we can
 * guarantee for a client-supplied report. A string sidesteps all three; the
 * 512 KB request cap keeps it comfortably below the document limit. Anything
 * worth querying lives in `summary`.
 */

export const MAX_BODY_BYTES = 512 * 1024;
export const MAX_NOTE_CHARS = 2000;
export const RATE_LIMIT_MAX = 5;
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
export const SUMMARY_LINES = 5;

// Discord limits.
const DISCORD_CONTENT_MAX = 2000;
const DISCORD_FIELD_MAX = 1024;
const DISCORD_DESCRIPTION_MAX = 4096;
const LOG_LINE_MAX = 200;

export interface DiagnosticsRequest {
  method: string;
  body: unknown;
  rawBodyLength?: number;
}

export interface DiagnosticsResult {
  status: number;
  body: Record<string, unknown>;
}

export interface DiagnosticSummary {
  version: string;
  warnCount: number;
  errorCount: number;
  lastIssues: string[];
}

export interface StoredReport {
  email: string;
  version: string;
  note: string;
  summary: DiagnosticSummary;
  /** JSON string of the full report. */
  report: string;
}

export interface DiagnosticsStore {
  /** Atomically records a hit; false when the email is over its limit. */
  consumeRateLimit(email: string, nowMs: number): Promise<boolean>;
  /** Persists the report (adding createdAt) and returns its new ID. */
  saveReport(doc: StoredReport): Promise<string>;
}

export interface DiagnosticsDeps {
  verifyToken: (idToken: string) => Promise<GoogleTokenInfo>;
  store: DiagnosticsStore;
  fetchImpl: typeof fetch;
  webhookUrl: string;
  now: () => number;
}

/**
 * Truncates to max chars, ending with an ellipsis when cut.
 * @param {string} s Input.
 * @param {number} max Maximum length.
 * @return {string} Possibly shortened string.
 */
export function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, Math.max(0, max - 1)) + "…";
}

/**
 * Escapes Discord markdown so user text cannot restyle the message.
 * @param {string} s Input.
 * @return {string} Escaped string.
 */
export function escapeMarkdown(s: string): string {
  return s.replace(/[\\*_~`|>#[\]]/g, "\\$&");
}

/**
 * Reads the report defensively into a version string and warn/error lines.
 * @param {Record<string, unknown>} report The opaque client report.
 * @return {DiagnosticSummary} Summary.
 */
export function summarize(report: Record<string, unknown>): DiagnosticSummary {
  const env = report.env;
  const rawVersion = env && typeof env === "object" ?
    (env as Record<string, unknown>).version : undefined;
  const version = typeof rawVersion === "string" ?
    truncate(rawVersion, 50) : "unknown";

  const log = Array.isArray(report.log) ? report.log : [];
  let warnCount = 0;
  let errorCount = 0;
  const issues: string[] = [];
  for (const entry of log) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (e.level !== "warn" && e.level !== "error") continue;
    if (e.level === "warn") warnCount++;
    else errorCount++;
    const where = [e.ctx, e.cat].filter((x) => typeof x === "string" && x)
      .join("/");
    const line = `${String(e.t ?? "?")} ${String(e.level).toUpperCase()}` +
      `${where ? " " + where : ""}: ${String(e.msg ?? "")}`;
    issues.push(truncate(line.replace(/\s+/g, " "), LOG_LINE_MAX));
  }
  return {
    version,
    warnCount,
    errorCount,
    lastIssues: issues.slice(-SUMMARY_LINES),
  };
}

/**
 * Builds the multipart body sent to the Discord webhook.
 * @param {string} reportId Firestore ID of the stored report.
 * @param {string} email Verified email.
 * @param {string} note Sanitized-length note.
 * @param {DiagnosticSummary} summary Report summary.
 * @param {string} reportJson Pretty-printed full report.
 * @return {FormData} The form data to POST.
 */
export function buildDiscordForm(
  reportId: string,
  email: string,
  note: string,
  summary: DiagnosticSummary,
  reportJson: string,
): FormData {
  const issues = summary.lastIssues.length ?
    "```\n" + summary.lastIssues.join("\n").replace(/```/g, "'''") + "\n```" :
    "_No warnings or errors logged._";
  // Keep the closing fence intact when truncating.
  const issuesField = issues.length <= DISCORD_FIELD_MAX ? issues :
    "```\n" + truncate(
      summary.lastIssues.join("\n").replace(/```/g, "'''"),
      DISCORD_FIELD_MAX - 10,
    ) + "\n```";

  const payload = {
    content: truncate(
      `New diagnostics report \`${reportId}\` from ` +
      escapeMarkdown(email), DISCORD_CONTENT_MAX),
    allowed_mentions: {parse: []},
    embeds: [{
      title: "Calens diagnostics report",
      description: truncate(
        note ? escapeMarkdown(note) : "_No note provided._",
        DISCORD_DESCRIPTION_MAX),
      fields: [
        {name: "Report ID", value: truncate(`\`${reportId}\``, 200),
          inline: true},
        {name: "Version", value: truncate(escapeMarkdown(summary.version), 200),
          inline: true},
        {name: "Warnings / Errors",
          value: `${summary.warnCount} / ${summary.errorCount}`, inline: true},
        {name: `Last ${SUMMARY_LINES} warn/error lines`, value: issuesField},
      ],
    }],
  };

  const form = new FormData();
  form.append("payload_json", JSON.stringify(payload));
  form.append(
    "files[0]",
    new Blob([reportJson], {type: "application/json"}),
    `calens-report-${reportId}.json`,
  );
  return form;
}

const fail = (status: number, error: string): DiagnosticsResult =>
  ({status, body: {error}});

/**
 * Handles one submitDiagnostics request.
 * @param {DiagnosticsRequest} req Method, parsed body and raw body size.
 * @param {DiagnosticsDeps} deps Injected collaborators.
 * @return {Promise<DiagnosticsResult>} HTTP status and JSON body.
 */
export async function handleDiagnostics(
  req: DiagnosticsRequest,
  deps: DiagnosticsDeps,
): Promise<DiagnosticsResult> {
  if (req.method !== "POST") return fail(405, "Method not allowed");

  let size = req.rawBodyLength;
  if (size === undefined) {
    try {
      size = JSON.stringify(req.body ?? null).length;
    } catch {
      return fail(400, "Request body is not valid JSON");
    }
  }
  if (size > MAX_BODY_BYTES) {
    return fail(413, `Report too large (limit ${MAX_BODY_BYTES / 1024} KB)`);
  }

  const body = req.body && typeof req.body === "object" ?
    req.body as Record<string, unknown> : {};
  const idToken = body.idToken;
  if (typeof idToken !== "string" || !idToken) {
    return fail(401, "Missing idToken");
  }

  let email: string;
  try {
    const info = await deps.verifyToken(idToken);
    if (typeof info.email !== "string" || !info.email) {
      return fail(401, "Token has no email");
    }
    if (!isEmailVerified(info)) return fail(401, "Email not verified");
    email = info.email;
  } catch (error) {
    logger.error("submitDiagnostics token verification error:", error);
    return fail(401, "Invalid token");
  }

  const report = body.report;
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    return fail(400, "Missing or invalid report");
  }
  if (body.note !== undefined && typeof body.note !== "string") {
    return fail(400, "note must be a string");
  }
  const note = ((body.note as string | undefined) ?? "").trim()
    .slice(0, MAX_NOTE_CHARS);

  try {
    const allowed = await deps.store.consumeRateLimit(email, deps.now());
    if (!allowed) {
      return fail(
        429,
        `Too many reports: limit is ${RATE_LIMIT_MAX} per hour. ` +
        "Please try again later.",
      );
    }
  } catch (error) {
    logger.error("submitDiagnostics rate limit error:", error);
    return fail(500, "Could not check rate limit");
  }

  const reportObj = report as Record<string, unknown>;
  const summary = summarize(reportObj);
  let reportId: string;
  try {
    reportId = await deps.store.saveReport({
      email,
      version: summary.version,
      note,
      summary,
      report: JSON.stringify(reportObj),
    });
  } catch (error) {
    logger.error("submitDiagnostics store error:", error);
    return fail(500, "Could not store report");
  }

  try {
    const response = await deps.fetchImpl(deps.webhookUrl, {
      method: "POST",
      body: buildDiscordForm(
        reportId, email, note, summary, JSON.stringify(reportObj, null, 2)),
    });
    if (!response.ok) {
      throw new Error(
        `Discord responded ${response.status}: ${await response.text()}`);
    }
  } catch (error) {
    logger.error("submitDiagnostics Discord post failed:", {reportId, error});
    return {status: 200, body: {reportId, discord: "failed"}};
  }

  return {status: 200, body: {reportId}};
}

/**
 * Firestore-backed store. Only the Admin SDK touches these collections;
 * firestore.rules denies all client access.
 * @param {admin.firestore.Firestore} db Firestore instance.
 * @return {DiagnosticsStore} Store.
 */
export function createFirestoreStore(
  db: admin.firestore.Firestore,
): DiagnosticsStore {
  return {
    async consumeRateLimit(email, nowMs) {
      const id = crypto.createHash("sha256")
        .update(email.toLowerCase()).digest("hex");
      const ref = db.collection("diagnosticRateLimits").doc(id);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const prior: unknown = snap.exists ? snap.get("hits") : [];
        const hits = (Array.isArray(prior) ? prior : [])
          .filter((h): h is number =>
            typeof h === "number" && h > nowMs - RATE_LIMIT_WINDOW_MS);
        if (hits.length >= RATE_LIMIT_MAX) return false;
        hits.push(nowMs);
        tx.set(ref, {hits});
        return true;
      });
    },
    async saveReport(doc) {
      const ref = db.collection("diagnosticReports").doc();
      await ref.set({
        ...doc,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return ref.id;
    },
  };
}
