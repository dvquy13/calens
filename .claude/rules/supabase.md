---
description: Supabase CLI and Edge Function gotchas for this project
paths:
  - supabase/**
---

## CLI Gotchas

**`supabase secrets list` shows fingerprints, not values.**
After running `supabase secrets set KEY=value`, the value is unrecoverable via CLI. Always save generated secrets (e.g. `METRICS_API_KEY`) to `.env` immediately.

**`supabase db push` with special-char passwords.**
The `--password` flag silently fails when the password contains `&` or `$`. Use `--db-url` with URL-encoded values:
```bash
supabase db push --db-url "postgresql://postgres.{project-ref}:{url-encoded-password}@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"
# & → %26   $ → %24   (password from the Supabase dashboard; never commit it)
```

**`supabase functions deploy` doesn't need Docker running.**
The Docker warning is benign for remote deploys. Use `--no-verify-jwt` when deploying functions that implement custom Bearer auth (like `METRICS_API_KEY`) — otherwise Supabase rejects requests before the function sees them.

## Edge Function Runtime

**Auto-provided env vars** (do NOT set manually via `supabase secrets set`):
- `SUPABASE_URL` — project URL
- `SUPABASE_SERVICE_ROLE_KEY` — service role key

**REST upsert pattern** (used instead of the JS client in Deno):
```typescript
headers: { ..., Prefer: 'resolution=merge-duplicates' }
// POST to /rest/v1/<table> with the full row including PK
```
