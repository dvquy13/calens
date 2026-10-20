# 04 · Release, then tear down the backend

## Tracker
- [ ] Release: tag + CWS submission + listing update (same day)
- [ ] Wait ~4 weeks for old versions to auto-update
- [ ] Delete subscription Cloud Functions (keep `submitDiagnostics`)
- [ ] Delete Firestore `users` collection
- [ ] Archive LemonSqueezy store, disable webhook, remove secrets
- [ ] Remove Firebase Remote Config promotion params
- [ ] Remove dead code in `functions/` and the GitHub secret for LemonSqueezy

## Release (after 02 + 03 merged)
- `git tag vX.Y.Z && git push origin vX.Y.Z` (CI stamps the version, builds and submits; see `docs/cws-deploy.md`).
- Human updates the CWS listing (see 03 §7) the same day.
- Add a CHANGELOG entry: "Calens is now free for everyone and open source."

## Wait before teardown
Old builds still call `checkSubscription` and fail closed if it disappears (see README, "Key facts"). CWS auto-updates most users within days, but stragglers exist. Wait ~4 weeks after the release is live. If the CWS dashboard shows per-version user counts, wait until the pre-release version is near zero.

## Teardown
1. **Cloud Functions** (`functions/src/index.ts`): delete `checkSubscription`, `createCheckout`, `getPromotionConfig`, `getPublicPromotionConfig`, `createPublicCheckout`, `lemonSqueezyWebhook`. Keep `submitDiagnostics`, `functions/src/diagnostics.ts`, `functions/src/auth.ts`. Deploy with `firebase deploy --only functions` (Firebase CLI prompts to delete removed functions; confirm).
2. **Firestore `users` collection**: holds emails + trial dates for every past signed-in user. Personal data with no remaining purpose: delete it (Firebase console or a one-off admin script). Human confirms before deletion. `diagnosticReports` / `diagnosticRateLimits` stay.
3. **Remote Config**: delete the promotion parameters in the Firebase console.
4. **LemonSqueezy** (human): archive the Calens product (monthly/annual/lifetime variants), delete the webhook, revoke the API key. Remove `LEMONSQUEEZY_API_KEY` / `LEMONSQUEEZY_WEBHOOK_SECRET` from Firebase functions config, local `.env`, and the GitHub secret (after 05 stops using it).
5. **Repo**: remove LemonSqueezy comments from `.env.production` and `.env.example`; consider untracking `.env.production` if it only holds `VITE_ENABLE_DEBUG_MODE`.

## Verify
- `npm --prefix functions test` passes.
- Live: Diagnostics "Send report" still delivers to Discord.
- Firebase console: only `submitDiagnostics` remains.
