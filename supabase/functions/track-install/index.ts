import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });

  let extensionId = '';
  try {
    const body = await req.json();
    extensionId = body?.extensionId ?? '';
  } catch {
    // body is optional — proceed without it
  }

  if (!extensionId) {
    console.warn('track-install: no extensionId provided');
  } else {
    console.log('track-install: extensionId =', extensionId);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const today = new Date().toISOString().slice(0, 10);

  // Increment total and today's daily count using a Postgres RPC call
  // Equivalent SQL:
  //   UPDATE installs
  //   SET total = total + 1,
  //       daily = jsonb_set(daily, '{<today>}',
  //                 to_jsonb(COALESCE((daily->>'{<today>}')::int, 0) + 1))
  //   WHERE id = 1
  //
  // We use the Supabase REST rpc endpoint to run a raw SQL statement via a stored procedure.
  // Since we can't create procedures here, we use two sequential REST calls instead:
  // 1. GET current row
  // 2. PATCH with updated values

  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  // Fetch current installs row
  const getRes = await fetch(`${supabaseUrl}/rest/v1/installs?id=eq.1&select=total,daily`, {
    headers,
  });

  if (!getRes.ok) {
    const err = await getRes.text();
    console.error('track-install: failed to read installs:', err);
    return json({ success: false, error: 'Failed to read installs' }, 500);
  }

  const rows = await getRes.json();
  const row = rows[0] ?? { total: 0, daily: {} };
  const newTotal = (row.total ?? 0) + 1;
  const daily = row.daily ?? {};
  daily[today] = (daily[today] ?? 0) + 1;

  // Patch with updated values
  const patchRes = await fetch(`${supabaseUrl}/rest/v1/installs?id=eq.1`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ total: newTotal, daily }),
  });

  if (!patchRes.ok) {
    const err = await patchRes.text();
    console.error('track-install: failed to update installs:', err);
    return json({ success: false, error: 'Failed to update installs' }, 500);
  }

  return json({ success: true, total: newTotal, date: today });
});
