# Calens: free, open-source, donation-supported

## Tracker

| # | Step | Plan file | Owner | Depends on | Status |
|---|------|-----------|-------|------------|--------|
| 1 | Server-side flip: `checkSubscription` returns free-for-all, stop writing user docs | [01-server-flip.md](01-server-flip.md) | agent | none | ✅ deployed + verified live 2026-10-20 |
| 2 | Remove subscription stack from the extension | [02-remove-subscription-client.md](02-remove-subscription-client.md) | agent | 1 | ✅ verified live 2026-10-20 |
| 3 | Support link, homepage + privacy + CWS listing | [03-support-ui-and-listing.md](03-support-ui-and-listing.md) | agent + human | 2 | 🟡 code done (`9114b37`, `b470914`); CWS listing at release (4a) |
| 4a | Release new version to CWS + update listing | [04-release-and-backend-teardown.md](04-release-and-backend-teardown.md) | agent + human | 2, 3 | ⬜ |
| 4b | Backend teardown (Cloud Functions, Firestore `users`, LemonSqueezy) | [04-release-and-backend-teardown.md](04-release-and-backend-teardown.md) | agent + human | 4a + ~4 weeks | ⬜ |
| 5 | Metrics and dashboard cleanup | [05-metrics-cleanup.md](05-metrics-cleanup.md) | agent | 1 | 🟡 edge fn deployed 2026-10-20; CI run + dashboard deploy after merge |
| 6 | Open-source: new public repo `dvquy13/calens` as the extension's home (flattened), MIT, FUNDING.yml | [06-open-source.md](06-open-source.md) | agent + human | 2, 3 | ⬜ planned 2026-10-20 |

Parallelism: 1 and 5 can start now. 2 and 3 touch the same side-panel files (`Sidepanel.tsx`, `AuthSection.tsx`), so run them sequentially in one worktree. 6.1 (rotate the Supabase DB password) can run any time and should not wait.

## Goal

Make Calens a product that serves a couple thousand people at near-zero maintenance cost. Donations are a thank-you channel, not an income source.

Success metric: CWS weekly users (`cws_users`, already tracked by the metrics pipeline). It replaces "Registered Users" and revenue.

## Decisions (2026-10-17)

- **Free for everyone.** No trial, no whitelist, no feature gating. The only paying user was the owner's test account, so no migration or grandfathering is needed.
- **Open-source** the extension on GitHub.
- **Donations via GitHub Sponsors** (`https://github.com/sponsors/dvquy13`, already live). Zero setup and no new accounts. Donors need a GitHub account; acceptable since donations are a thank-you, not income.
- **Donation flow:** a "Support Calens" link in the side panel that opens the Sponsors page in a new tab. The URL lives in one constant, `SUPPORT_URL`, so changing the destination later is a one-line change.
- **Ask gently:** one permanent footer link. No banners, no prompts, no nagging.

## Key facts from codebase exploration

- The gate fails closed. `requireActiveSubscription` (`src/lib/subscription-guard.ts`) calls the `checkSubscription` Cloud Function when the 24h cache in `chrome.storage.local` is stale. If the call fails, it throws `SubscriptionRequiredError` and the user loses access. **Never delete `checkSubscription` while old extension versions are in the wild.** Hence step 1 (flip server-side first) and the ~4-week wait before step 6.
- Firebase is used for exactly two things besides subscriptions:
  1. Diagnostics "Send report" (`src/lib/diagnostics-submit.ts` → `submitDiagnostics` Cloud Function → Firestore `diagnosticReports` + Discord webhook). It borrows `getGoogleIdToken` from `subscription-service.ts`.
  2. The GA4 metric reuses the Firebase admin-SDK service account as its credential.
- Sign-in is `chrome.identity`, not Firebase. Unaffected.
- No Firebase/LemonSqueezy entries in `manifest.json` host permissions or CSP. Nothing to change there.
- Root `package.json` has no Firebase deps; only `functions/package.json` does.

## Owner answers (2026-10-20)

1. **Diagnostics backend:** keep `submitDiagnostics` on Firebase.
2. **Public repo:** a new public repo `dvquy13/calens` with one squashed commit becomes the extension's home, flattened to the repo root. The current repo becomes `calens-private` (archive). History there holds a Supabase DB password and deleted credential/cookie scripts, so it is never published.
3. **License:** MIT.
