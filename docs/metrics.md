# Metrics pipeline and dashboard

`dashboard.html` is the metrics dashboard, live at https://dashboard.calens.dev. It leads with CWS weekly users (`cws_users`), the project's success metric.

## How it runs

- `.github/workflows/fetch-metrics.yml` runs daily at 20:13 UTC (03:13 GMT+7): `analytics/scripts/fetch-metrics.py` fetches every config in `analytics/configs/`, `push-and-notify.py` writes them to Supabase and posts the daily digest to Discord (`analytics/alerts.yaml`), then the dashboard is built and deployed.
- Changes to `dashboard.html` deploy through `deploy-dashboard.yml`.
- The Supabase edge function `supabase/functions/daily-metrics-snapshot/` (Supabase cron) writes website traffic from GA4. Deploy it with `supabase functions deploy daily-metrics-snapshot --no-verify-jwt`; setup in [set-up.md](set-up.md).

**Stamp architecture:** `dashboard.html` in `main` is a pure template with no metrics snapshot. `analytics/scripts/stamp-dashboard.py` inserts the snapshot `<noscript>` block into `_site/index.html` (the deploy artifact) at CI time, never into source, so daily runs never commit back to `main`.

`dashboard.html` uses `__SUPABASE_URL__` and `__SUPABASE_KEY__` placeholders, filled by `sed` at deploy time. The source has no credentials.

## Manual runs

```bash
make fetch-metrics                                # trigger the CI run and watch it
gh workflow run "Deploy Dashboard" --repo dvquy13/calens

# Local run (needs analytics/.env and credentials/)
cd analytics
uv run scripts/fetch-metrics.py | SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... uv run scripts/push-and-notify.py

# Local preview: placeholders won't load data, use the live URL for real numbers
python3 -m http.server 3000   # open http://localhost:3000/dashboard.html
```

## Gotchas

- Every secret a workflow step uses must be listed in that step's `env:` block. GitHub does not inject repo secrets on its own.
- The GSC metrics use `GOOGLE_ADC_CREDENTIALS` (gcloud application-default credentials). Those credentials must include the `webmasters.readonly` scope, granted at `gcloud auth application-default login`.
- `fetch-metrics.py` and `push-and-notify.py` are generic pipeline scripts: their cookie-auth and Telegram branches are unused here (no config uses `auth.type: cookie`, `alerts.yaml` has no `telegram` section).
