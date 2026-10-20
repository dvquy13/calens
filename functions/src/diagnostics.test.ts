import {test} from "node:test";
import * as assert from "node:assert/strict";
import {
  handleDiagnostics,
  createFirestoreStore,
  DiagnosticsDeps,
  DiagnosticsStore,
  StoredReport,
  MAX_BODY_BYTES,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
} from "./diagnostics";

interface Harness {
  deps: DiagnosticsDeps;
  saved: StoredReport[];
  discordCalls: {url: string; init: RequestInit}[];
  setDiscord: (r: () => Promise<Response>) => void;
  setNow: (n: number) => void;
}

/**
 * Builds deps with an in-memory store and mocked Discord.
 * @param {string} email Email the mocked token resolves to ("" = reject).
 * @return {Harness} Handles for assertions.
 */
function harness(email = "user@example.com"): Harness {
  const saved: StoredReport[] = [];
  const hits = new Map<string, number[]>();
  let now = 1_000_000_000;
  let discord = async () => new Response(null, {status: 204});
  const discordCalls: Harness["discordCalls"] = [];
  const store: DiagnosticsStore = {
    async consumeRateLimit(e, nowMs) {
      const recent = (hits.get(e) ?? []).filter(
        (h) => h > nowMs - RATE_LIMIT_WINDOW_MS);
      if (recent.length >= RATE_LIMIT_MAX) return false;
      hits.set(e, [...recent, nowMs]);
      return true;
    },
    async saveReport(doc) {
      saved.push(doc);
      return `id${saved.length}`;
    },
  };
  const deps: DiagnosticsDeps = {
    verifyToken: async () => {
      if (!email) throw new Error("Invalid token");
      return {email, email_verified: "true"};
    },
    store,
    fetchImpl: (async (url: string, init: RequestInit) => {
      discordCalls.push({url, init});
      return discord();
    }) as unknown as typeof fetch,
    webhookUrl: "https://discord.test/webhook",
    now: () => now,
  };
  return {
    deps, saved, discordCalls,
    setDiscord: (r) => {
      discord = r;
    },
    setNow: (n) => {
      now = n;
    },
  };
}

const report = {
  env: {version: "1.2.3"},
  user: {email: "spoofed@evil.com"},
  log: [
    {t: 1, ctx: "bg", cat: "sync", level: "info", msg: "ok"},
    {t: 2, ctx: "bg", cat: "sync", level: "warn", msg: "slow"},
    {t: 3, ctx: "cs", cat: "dom", level: "error", msg: "boom"},
  ],
};
const post = (body: unknown, rawBodyLength?: number) =>
  ({method: "POST", body, rawBodyLength});

test("non-POST is 405", async () => {
  const h = harness();
  const r = await handleDiagnostics({method: "GET", body: {}}, h.deps);
  assert.equal(r.status, 405);
});

test("missing token is 401", async () => {
  const h = harness();
  const r = await handleDiagnostics(post({report}), h.deps);
  assert.equal(r.status, 401);
  assert.ok(typeof r.body.error === "string");
});

test("invalid token is 401 and stores nothing", async () => {
  const h = harness("");
  const r = await handleDiagnostics(post({idToken: "x", report}), h.deps);
  assert.equal(r.status, 401);
  assert.equal(h.saved.length, 0);
});

test("oversize body is 413", async () => {
  const h = harness();
  const r = await handleDiagnostics(
    post({idToken: "t", report}, MAX_BODY_BYTES + 1), h.deps);
  assert.equal(r.status, 413);
  const big = {idToken: "t", report: {log: "x".repeat(MAX_BODY_BYTES)}};
  assert.equal((await handleDiagnostics(post(big), h.deps)).status, 413);
});

test("invalid report is 400", async () => {
  const h = harness();
  const r = await handleDiagnostics(post({idToken: "t", report: []}), h.deps);
  assert.equal(r.status, 400);
});

test("6th report within the hour is 429, window then rolls", async () => {
  const h = harness();
  for (let i = 0; i < RATE_LIMIT_MAX; i++) {
    const r = await handleDiagnostics(post({idToken: "t", report}), h.deps);
    assert.equal(r.status, 200);
  }
  const blocked = await handleDiagnostics(
    post({idToken: "t", report}), h.deps);
  assert.equal(blocked.status, 429);
  assert.match(String(blocked.body.error), /per hour/);
  h.setNow(1_000_000_000 + RATE_LIMIT_WINDOW_MS + 1);
  const again = await handleDiagnostics(post({idToken: "t", report}), h.deps);
  assert.equal(again.status, 200);
});

test("stores report using the verified email, with summary", async () => {
  const h = harness();
  const r = await handleDiagnostics(
    post({idToken: "t", report, note: "  it broke  "}), h.deps);
  assert.deepEqual(r.body, {reportId: "id1"});
  const doc = h.saved[0];
  assert.equal(doc.email, "user@example.com");
  assert.equal(doc.version, "1.2.3");
  assert.equal(doc.note, "it broke");
  assert.equal(doc.summary.warnCount, 1);
  assert.equal(doc.summary.errorCount, 1);
  assert.equal(doc.summary.lastIssues.length, 2);
  assert.deepEqual(JSON.parse(doc.report), report);
});

test("tolerates a malformed report shape", async () => {
  const h = harness();
  const odd = {
    env: 5,
    log: [null, "x", {level: "error"}, {level: "warn", msg: 7}],
  };
  const r = await handleDiagnostics(post({idToken: "t", report: odd}), h.deps);
  assert.equal(r.status, 200);
  assert.equal(h.saved[0].version, "unknown");
  assert.equal(h.saved[0].summary.errorCount, 1);
  assert.equal(h.saved[0].summary.warnCount, 1);
});

test("note is capped at 2000 chars", async () => {
  const h = harness();
  await handleDiagnostics(
    post({idToken: "t", report, note: "a".repeat(5000)}), h.deps);
  assert.equal(h.saved[0].note.length, 2000);
});

test("Discord payload: multipart, attachment, safe mentions", async () => {
  const h = harness();
  const note = "@everyone **bold** " + "n".repeat(6000);
  const r = await handleDiagnostics(
    post({idToken: "t", report, note}), h.deps);
  assert.equal(r.status, 200);
  assert.equal(h.discordCalls.length, 1);
  const {url, init} = h.discordCalls[0];
  assert.equal(url, "https://discord.test/webhook");
  assert.equal(init.method, "POST");
  const form = init.body as FormData;
  assert.ok(form instanceof FormData);
  const payload = JSON.parse(form.get("payload_json") as string);
  assert.deepEqual(payload.allowed_mentions, {parse: []});
  assert.ok(payload.content.length <= 2000);
  assert.ok(payload.content.includes("id1"));
  assert.ok(payload.content.includes("user@example.com"));
  const embed = payload.embeds[0];
  assert.ok(embed.description.length <= 4096);
  assert.ok(embed.description.includes("\\*\\*bold\\*\\*"));
  for (const f of embed.fields) assert.ok(f.value.length <= 1024);
  const issues = embed.fields.find((f: {name: string}) =>
    f.name.startsWith("Last"));
  assert.ok(issues.value.includes("ERROR cs/dom: boom"));
  const file = form.get("files[0]") as File;
  assert.equal(file.name, "calens-report-id1.json");
  assert.deepEqual(JSON.parse(await file.text()), report);
});

test("long log lines stay within Discord field limits", async () => {
  const h = harness();
  const log = Array.from({length: 20}, (_, i) =>
    ({t: i, ctx: "bg", cat: "x", level: "error", msg: "m".repeat(5000)}));
  await handleDiagnostics(
    post({idToken: "t", report: {env: {version: "1"}, log}}), h.deps);
  const form = h.discordCalls[0].init.body as FormData;
  const payload = JSON.parse(form.get("payload_json") as string);
  const issues = payload.embeds[0].fields[3].value as string;
  assert.ok(issues.length <= 1024);
  assert.ok(issues.endsWith("```"));
});

test("Discord failure still stores and returns reportId", async () => {
  const h = harness();
  h.setDiscord(async () => new Response("nope", {status: 500}));
  const r = await handleDiagnostics(post({idToken: "t", report}), h.deps);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, {reportId: "id1", discord: "failed"});
  assert.equal(h.saved.length, 1);

  h.setDiscord(async () => {
    throw new Error("network down");
  });
  const r2 = await handleDiagnostics(post({idToken: "t", report}), h.deps);
  assert.deepEqual(r2.body, {reportId: "id2", discord: "failed"});
});

test("Firestore rate limit store keeps a rolling window", async () => {
  const docs = new Map<string, {hits: number[]}>();
  const ref = (id: string) => ({id});
  const db = {
    collection: () => ({doc: (id: string) => ref(id)}),
    runTransaction: async (fn: (tx: unknown) => Promise<boolean>) =>
      fn({
        get: async (r: {id: string}) => ({
          exists: docs.has(r.id),
          get: () => docs.get(r.id)?.hits,
        }),
        set: (r: {id: string}, v: {hits: number[]}) => {
          docs.set(r.id, v);
        },
      }),
  };
  const store = createFirestoreStore(
    db as unknown as Parameters<typeof createFirestoreStore>[0]);
  const t0 = 5_000_000;
  for (let i = 0; i < RATE_LIMIT_MAX; i++) {
    assert.equal(await store.consumeRateLimit("A@x.com", t0 + i), true);
  }
  assert.equal(await store.consumeRateLimit("a@x.com", t0 + 10), false);
  assert.equal(
    await store.consumeRateLimit("a@x.com", t0 + RATE_LIMIT_WINDOW_MS + 100),
    true);
  assert.equal(docs.size, 1);
  const [id] = [...docs.keys()];
  assert.match(id, /^[0-9a-f]{64}$/);
});
