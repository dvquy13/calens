# 03 · Support link, homepage, privacy, CWS listing

## Tracker
- [ ] `SUPPORT_URL` constant
- [ ] Footer "Support Calens" link in the side panel
- [ ] Resolve the empty gear popover in `AuthSection`
- [ ] Homepage: replace Pricing with a "Free & open source" section
- [ ] Privacy policy: remove payments/LemonSqueezy/trial user records
- [ ] CWS listing copy + "in-app purchases" flag + payment-data checkbox (agent browser, at release)
- [ ] Tests + live verification

Depends on 02 (same files).

## 1. Constant
`src/lib/links.ts` already holds `COMMUNITY_INVITE_URL`. Add `SUPPORT_URL = 'https://github.com/sponsors/dvquy13'`. Every support link in the extension and homepage uses this one constant, so pointing it elsewhere later is a one-line change.

## 2. Footer link
`src/sidepanel/Sidepanel.tsx` footer (~L282–297) has "Chat with Founder" (Discord) and "Privacy Policy". Add "Support Calens" next to the Discord link, same `<a target="_blank" rel="noopener noreferrer">` pattern, `href={SUPPORT_URL}`, small heart icon (lucide `Heart`, already in the icon set if lucide is used; check before adding a dep). Quiet styling, same weight as neighbors.

## 3. Gear popover
After 02, the `AuthSection` gear popover has no items. Remove the gear entirely (simplest). Do not move the Support link there: one placement is enough.

## 4. Homepage
`src/homepage/`: replace the Pricing section with a short "Free & open source" block: free forever, link to GitHub repo (placeholder until step 06 publishes it), Support link (import `SUPPORT_URL` from `src/lib/links.ts`, as `Navbar.tsx` already does for `COMMUNITY_INVITE_URL`). Update `Navbar.tsx` links accordingly. `CTABanner.tsx` (L13): "Free to install." becomes "Free and open source." to match. Remove `gtag` `begin_checkout`/`checkout_generated` events (gone with Pricing). Redeploy landing via `deploy-landing.yml` after merge.

## 5. Privacy policy
`src/privacy/Privacy.tsx` (L22, 59–71, 81–101, 161–162, 218) and `public/pages/privacy.html` (L174, 209–237, 296, 349): remove payment processing, LemonSqueezy, and the Firestore user/trial record. Keep the Diagnostics section (still Firebase, per README open question 1). Add one line: donations are handled by GitHub Sponsors on GitHub's site; Calens receives no payment data. Update the "last updated" date.

## 6. CWS listing (agent, via the agent browser signed in as dvquys)
Read-only audit 2026-10-20 (dashboard `…/devconsole/84b5fffc-fcef-4cea-867f-4fd1d54343b4/celfolmbbepfnnmchmfojakakipnmenk/edit/*`, UI in Vietnamese):
- **Listing** (`/edit/listing`): description has no trial/premium/pricing wording. Only add a short "Free and open source" block (draft in the PR description).
- **Distribution** (`/edit/distribution`), Payments: currently **"Có tính năng mua hàng trong ứng dụng" (has in-app purchases)**. Switch to **"Miễn phí" (Free)**.
- **Privacy** (`/edit/privacy`), data collected: **"Thông tin thanh toán và tài chính" (financial and payment info) is checked**. Uncheck it. Keep PII, authentication info, personal communications and user activity (Diagnostics still sends them on request).
- Do this at the same time as the release in 04 so the listing matches the shipped build: "Lưu bản nháp" (save draft) before tagging; the CI publish should then submit the listing draft with the new package (unverified: check the item status page after CI, and click "Gửi để xem xét" if the listing draft is still pending).

## Verify
- `npm run typecheck && npm run lint && npm run test && npm run test:e2e && npm run build-dev`
- Live (`verify-in-browser`): footer link opens the GitHub Sponsors page in a new tab.
