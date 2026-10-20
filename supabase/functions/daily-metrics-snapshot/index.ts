import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// ---------------------------------------------------------------------------
// CORS helpers
// ---------------------------------------------------------------------------
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

function corsResponse(body: string, status = 200, extra: Record<string, string> = {}) {
  return new Response(body, {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', ...extra },
  });
}

// ---------------------------------------------------------------------------
// Step 1: Google service-account JWT → access token
// ---------------------------------------------------------------------------
async function getGoogleAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);
  const clientEmail: string = sa.client_email;
  const privateKeyPem: string = sa.private_key;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
  };

  const b64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const signingInput = `${b64url(header)}.${b64url(payload)}`;

  // Strip PEM headers and decode
  const pemBody = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const keyBytes = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const encoder = new TextEncoder();
  const signatureBytes = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(signingInput),
  );

  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const jwt = `${signingInput}.${signature}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Google token exchange failed: ${tokenRes.status} ${err}`);
  }

  const tokenData = await tokenRes.json();
  return tokenData.access_token as string;
}

// ---------------------------------------------------------------------------
// Step 2: GA4 — website traffic metrics
// ---------------------------------------------------------------------------
interface WebsiteMetrics {
  visitors_7d: number | null;
  visitors_30d: number | null;
}

async function runGA4Report(
  accessToken: string,
  propertyId: string,
  // deno-lint-ignore no-explicit-any
  body: Record<string, any>,
  // deno-lint-ignore no-explicit-any
): Promise<Record<string, any>> {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GA4 runReport failed: ${res.status} ${err}`);
  }
  return res.json();
}

async function fetchGA4Metrics(
  propertyId: string,
  accessToken: string,
): Promise<WebsiteMetrics> {
  try {
    const [report7d, report30d] = await Promise.all([
      runGA4Report(accessToken, propertyId, {
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        metrics: [{ name: 'sessions' }],
      }),
      runGA4Report(accessToken, propertyId, {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        metrics: [{ name: 'sessions' }],
      }),
    ]);

    let visitors7d = 0;
    for (const row of report7d.rows ?? []) {
      visitors7d += parseInt(row.metricValues?.[0]?.value ?? '0', 10);
    }

    let visitors30d = 0;
    for (const row of report30d.rows ?? []) {
      visitors30d += parseInt(row.metricValues?.[0]?.value ?? '0', 10);
    }

    return { visitors_7d: visitors7d, visitors_30d: visitors30d };
  } catch (err) {
    console.error('GA4 fetch failed (non-fatal):', err);
    return { visitors_7d: null, visitors_30d: null };
  }
}

// ---------------------------------------------------------------------------
// Step 3: Write to Supabase Postgres via REST
// ---------------------------------------------------------------------------
async function upsertSupabase(
  supabaseUrl: string,
  serviceRoleKey: string,
  website: WebsiteMetrics | null,
  generatedAt: string,
): Promise<void> {
  const base = `${supabaseUrl}/rest/v1`;
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates',
  };

  const today = generatedAt.slice(0, 10);

  // `users` and `revenue` columns are kept for historic rows; new rows always write null.
  const payload = { users: null, revenue: null, website, generated_at: generatedAt };

  // Upsert metrics_latest (singleton row, id=1)
  const latestRes = await fetch(`${base}/metrics_latest`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ id: 1, ...payload }),
  });

  if (!latestRes.ok) {
    const err = await latestRes.text();
    console.error(`Failed to upsert metrics_latest: ${latestRes.status} ${err}`);
  }

  // Upsert metrics_snapshots (one row per day)
  const snapshotRes = await fetch(`${base}/metrics_snapshots`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ date: today, ...payload }),
  });

  if (!snapshotRes.ok) {
    const err = await snapshotRes.text();
    console.error(`Failed to upsert metrics_snapshots: ${snapshotRes.status} ${err}`);
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  // Auth check
  const metricsApiKey = Deno.env.get('METRICS_API_KEY') ?? '';
  const authHeader = req.headers.get('Authorization') ?? '';
  const providedKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!providedKey || providedKey !== metricsApiKey) {
    return corsResponse(JSON.stringify({ success: false, error: 'Unauthorized' }), 401);
  }

  const generatedAt = new Date().toISOString();

  // Read required env vars
  const serviceAccountJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON') ?? '';
  const ga4PropertyId = Deno.env.get('GA4_PROPERTY_ID') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!serviceAccountJson) {
    return corsResponse(
      JSON.stringify({ success: false, error: 'FIREBASE_SERVICE_ACCOUNT_JSON not set' }),
      500,
    );
  }

  // Fetch Google access token
  let googleAccessToken: string;
  try {
    googleAccessToken = await getGoogleAccessToken(serviceAccountJson);
  } catch (err) {
    console.error('Failed to get Google access token:', err);
    return corsResponse(
      JSON.stringify({ success: false, error: `Google auth failed: ${(err as Error).message}` }),
      500,
    );
  }

  const website = await fetchGA4Metrics(ga4PropertyId, googleAccessToken);

  // Write to Supabase
  try {
    await upsertSupabase(supabaseUrl, supabaseServiceRoleKey, website, generatedAt);
  } catch (err) {
    console.error('Supabase write failed:', err);
    return corsResponse(
      JSON.stringify({
        success: false,
        error: `Supabase write failed: ${(err as Error).message}`,
        website,
        generated_at: generatedAt,
      }),
      500,
    );
  }

  return corsResponse(
    JSON.stringify({ success: true, generated_at: generatedAt, website }),
  );
});
