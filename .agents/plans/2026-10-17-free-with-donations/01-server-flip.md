# 01 · Server-side flip: free for everyone, today

## Tracker
- [ ] Change `checkSubscription` to always return `canUseFeatures: true`
- [ ] Stop creating/updating `users/{email}` docs
- [ ] Deploy only that function
- [ ] Verify with an installed (old) build

## Why first
Every installed copy of Calens asks `checkSubscription` at most once per 24h and fails closed. Flipping the server response makes every existing install free within a day, with no extension release and no CWS review. It also makes the later client removal (step 02) zero-risk: whatever version a user runs, they get full access.

## Changes
File: `functions/src/index.ts` (`checkSubscription`, ~L26–170).

- Keep the token verification (so random callers can't use it as an open endpoint), then return a constant response:
  ```ts
  { canUseFeatures: true, subscriptionStatus: "active", whitelisted: true }
  ```
  Use `"active"` + `whitelisted: true` so old clients hide the Upgrade button and paywall (see `Sidepanel.tsx`: `UpgradeButton` shows unless active/whitelisted; panel auto-expands on `expired`).
- Remove the Firestore read/write of `users/{email}`: no more trial docs, no more collecting emails.
- Leave `createCheckout`, `lemonSqueezyWebhook`, promotions and `submitDiagnostics` untouched for now. Teardown happens in step 04.

## Deploy
From `chrome-extension/`: `firebase deploy --only functions:checkSubscription`. Requires the owner's Firebase login (human runs it if the agent has no credentials).

## Verify
- `npm --prefix functions test` (diagnostics tests must still pass).
- In the agent browser with the current CWS build, clear `subscription_status*` from `chrome.storage.local` (Diagnostics panel or devtools), reopen the side panel: no paywall, no Upgrade button, charts render. Diagnostics shows `active (whitelisted)`.
