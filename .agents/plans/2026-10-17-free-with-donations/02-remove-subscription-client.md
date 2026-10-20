# 02 · Remove the subscription stack from the extension

## Tracker
- [ ] Move `getGoogleIdToken` out of `subscription-service.ts`
- [ ] Delete subscription/pricing/remote-config modules and components
- [ ] Remove gates from background handlers
- [ ] Strip subscription state from `useAuth`, `AuthSection`, `Sidepanel`, `DebugPanel`, diagnostics report
- [ ] Remove message types
- [ ] Remove homepage Pricing section
- [ ] Update unit + e2e tests and fixtures
- [ ] Gates green: typecheck, lint, test, test:e2e, build

Depends on 01 being deployed (so the client removal can ship without coordinating with the backend).

## 1. Preserve what Diagnostics needs
`src/lib/diagnostics-submit.ts` imports `getGoogleIdToken` from `src/lib/subscription-service.ts`. Move `getGoogleIdToken` to `src/lib/google-auth.ts` (where the rest of `chrome.identity` logic lives) and update the import. Do this first, as its own commit.

## 2. Delete
- `src/lib/subscription-service.ts`
- `src/lib/subscription-guard.ts`
- `src/background/subscription-handlers.ts`
- `src/lib/pricing.ts`, `src/lib/pricing-utils.ts`
- `src/lib/remote-config.ts`, `src/lib/firebase-config.ts`
- `src/components/pricing/` (whole folder)
- `src/components/sidepanel/PaywallCard.tsx`, `src/components/sidepanel/UpgradePanel.tsx`
- `src/homepage/components/Pricing.tsx`

## 3. Edit
- `src/background/indexeddb-handlers.ts`: drop the `requireActiveSubscription` calls (L47, 73, 103, 144, 170) and the `SubscriptionRequiredError` catch branches. Handlers should behave exactly as the "allowed" path does today.
- `src/background/sync-handlers.ts`: same for initial and manual sync.
- `src/background/index.ts`: remove the import (L27) and the `CHECK_SUBSCRIPTION` / `GENERATE_CHECKOUT_URL` routes (L291–298).
- `src/background/diagnostics-report.ts`: remove the `subscription` section (type L35–41, storage read L63–99, return L137).
- `src/lib/message-types.ts`: remove `CHECK_SUBSCRIPTION`, `SUBSCRIPTION_STATUS_UPDATED`, `GENERATE_CHECKOUT_URL`, their interfaces, `SubscriptionStatus`, and union members.
- `src/hooks/useAuth.tsx`: remove `subscriptionStatus` state, the mount/sign-in `CHECK_SUBSCRIPTION` calls, the `SUBSCRIPTION_STATUS_UPDATED` listener and `clearSubscriptionCache`. Read the file whole before editing; the agent's line refs (13–15, 37, 67, 125–145, 207–235, 308, 435–490, 513) are approximate.
- `src/sidepanel/Sidepanel.tsx`: remove `showPaywall`/`canUseFeatures`, `PaywallCard`, `UpgradeButton`, the auto-expand-on-expired logic and the promotion-cache effect (~L143–175). `TimeChart` and `ContributionGraphSection` render unconditionally for authenticated users.
- `src/components/sidepanel/AuthSection.tsx`: remove badge logic (L24–63), Crown/"Premium" tooltip (L176–186), `showPaywall` prop, and the "Manage Subscription" item. The gear popover will be empty; step 03 decides whether it hosts the Support link or goes away.
- `src/components/sidepanel/DebugPanel.tsx`: remove `describeSubscription` and the "Subscription" row. Keep the rest.
- `src/homepage/components/Navbar.tsx` (Pricing links L71–75, L118–121), `Homepage.tsx` (L6, L18) and the dead `#pricing` rule in `homepage.css` (L14).
- `src/lib/diag-log.ts`, `src/content/diag.ts`: remove the `'subscription'` diag category if nothing else uses it.
- Check `src/lib/db/database.ts` (4 keyword hits, uninspected) and remove anything subscription-related.

## 4. Storage cleanup
Existing installs still hold `subscription_status`, `subscription_status_timestamp` and `remote_config_cache` in `chrome.storage.local`. On `chrome.runtime.onInstalled` with `reason === 'update'` in `src/background/index.ts`, remove those three keys once.

## 5. Tests
- `src/background/indexeddb-handlers.test.ts`: drop the `subscription-guard` mock (L3–5).
- `src/background/diagnostics-report.test.ts`: drop the `subscription_status` fixture and assertion.
- `src/background/message-log.test.ts`: it asserts `CHECK_SUBSCRIPTION` logging drops the `idToken`. Repoint to another message type that carries a token, or delete if none exists. The redaction behavior must stay covered.
- `e2e/fixtures/harness.ts`: remove the `subscription_status` seed in `seedExtensionState` (L78–91).
- `e2e/diagnostics-report.spec.ts`: remove the `active (whitelisted)` assertion.
- `.claude/rules/e2e-testing.md`: remove the subscription-seed section (L20–26).

## 6. Docs (same PR)
- `CLAUDE.md`: remove the Firestore `subscriptionStatus` gotcha and the LemonSqueezy Cloudflare gotcha (L69–74).
- `docs/patterns-and-decisions.md`: remove "Firebase used only for subscription" notes (L406–423), the LemonSqueezy gotcha (L427–452), the `subscription` diag category (L717–726). Keep the remount pattern (L460–576) but rewrite its subscription example. Keep Diagnostics submit (L755–773).
- Delete `MILESTONE-6-DEPLOYMENT.md` (Remote Config promotions, obsolete).

## Verify
- `npm run typecheck && npm run lint && npm run test && npm run test:e2e && npm run build-dev`
- `grep -rniE "subscription|paywall|premium|trial|lemon|checkout|remote-config|pricing" src e2e` returns nothing unexpected.
- Live: `verify-in-browser` skill. Sign in, side panel shows charts with no paywall/upgrade UI; Diagnostics "Send report" still succeeds.
