# 05 · Metrics and dashboard cleanup

## Tracker
- [ ] Remove `firebase_users`, `lemon_revenue`, `lemon_orders` metrics
- [ ] Keep GA4 working (it shares the Firebase admin-SDK credential)
- [ ] Update Supabase `daily-metrics-snapshot`
- [ ] Update `dashboard.html`: lead with CWS weekly users
- [ ] Update `fetch-metrics.yml` secrets
- [ ] Verify a CI metrics run + dashboard deploy

Can start once 01 is deployed (after the flip, `users` stops growing, so "Registered Users" becomes meaningless anyway).

## Changes
- `analytics/configs/`: delete `firebase-users.json`, `lemon-revenue.json`, `lemon-orders.json`. Delete matching fixtures `analytics/fixtures/firebase_users.txt`, `lemon_orders.txt`, `lemon_revenue.txt`, and their labels in `analytics/alerts.yaml`. Configs are globbed by `analytics/scripts/fetch-metrics.py`, so deletion is enough.
- **GA4 credential.** `ga4-users-28d.json` reads `credentials/calens-chrome-ext-firebase-adminsdk-fbsvc-*.json`, written from the `GA4_SERVICE_ACCOUNT_JSON` secret in `.github/workflows/fetch-metrics.yml`. Firebase stays (Diagnostics), so this keeps working. Leave as is; optionally rename the file reference to something credential-neutral later.
- `.github/workflows/fetch-metrics.yml` (repo root): remove `LEMONSQUEEZY_API_KEY` from the step `env:`. Remember the CI gotcha: secrets must be listed explicitly per step.
- `supabase/functions/daily-metrics-snapshot/index.ts`: remove the Firestore `users` query (subscriptionStatus breakdown, new_7d/new_30d) and LemonSqueezy MRR/revenue; remove the `begin_checkout` funnel step from GA4. Leave `users`/`revenue` jsonb columns in `001_metrics_tables.sql` alone (historic rows); write `null` going forward. Redeploy the edge function (`docs/set-up.md` L85–96).
- `supabase/functions/track-install/`: no caller found in the repo. Ask the owner; if unused, delete.
- `dashboard.html`: remove the Revenue section and `firebase_users`; make `cws_users` the headline number ("Weekly users"). Deploys automatically via `deploy-dashboard.yml`.

## Verify
- `make fetch-metrics` (triggers CI and watches output): no errors, no missing-secret failures.
- https://dashboard.calens.dev shows weekly users first, no revenue section, no broken tiles.
