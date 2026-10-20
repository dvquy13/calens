# 06 · Open-source: a new public repo as Calens's home

## Tracker
- [x] 6.0 Merge `remove-paywall` into `main` (publish the free version, not the paywalled one)
- [x] 6.1 Export exclude list: private material stays in `calens-private` only
- [x] 6.2 Scrub the tree: credentials in docs, PII fixtures, personal paths
- [x] 6.3 Lock down the Claude workflows for a public repo
- [x] 6.4 Public-facing files: LICENSE (MIT), root README, FUNDING.yml, SECURITY.md, CONTRIBUTING.md
- [x] 6.5 Flatten: export `chrome-extension/` to the root of a staging tree, port workflows, all gates green there
- [x] 6.6 gitleaks scan of the staging tree: zero findings
- [x] 6.7 Publish: rename old repo to `calens-private`, create public `dvquy13/calens`, single squashed commit (human confirms)
- [x] 6.8 Secrets + CI on the new repo; disable schedules in the archive
- [ ] 6.9 Link it up: homepage GitHub button, CWS listing repo link
- [ ] 6.10 Rotate the Supabase DB password (human, recommended hygiene, not a blocker)

## Decisions (owner, 2026-10-20)
- Diagnostics stays on Firebase (`submitDiagnostics`).
- **Fresh public repo** `dvquy13/calens` with one squashed initial commit. It becomes the home of the extension: the extension lives at the **repo root** (no `chrome-extension/` subfolder). The current repo is renamed `dvquy13/calens-private` and kept as the archive.
- **MIT** license.

## Facts that shape the plan
- In git, the parent web app is already gone. Tracked files outside `chrome-extension/` are only `.github/workflows/*` (7), `.nvmrc`, `.gitignore` (Next.js leftovers) and `.env.example` (`NEXT_PUBLIC_*` leftovers). The root `src/`, `dev-tools/`, `credentials/`, `_site/` are untracked local leftovers, so they never reach the new repo.
- A fresh repo has no history, so the Supabase DB password in old commits (`98c40bc`, `41273aa`) and the deleted credential/cookie scripts stay in the private archive only. HEAD still has the password in `docs/set-up.md` and `.claude/rules/supabase.md`: 6.2 replaces both.
- **Wrangler gotcha after flattening:** `wrangler pages deploy` treats a `functions/` dir in its CWD as Pages Functions. Today that is avoided by deploying from the repo root, where no `functions/` exists. After flattening, the Firebase `functions/` sits at the root, so deploy from inside the output dir instead (`cd _site && npx wrangler pages deploy . …`). Update the CLAUDE.md gotcha to match.

## 6.0 Merge first
PR `remove-paywall` → `main` in the current repo. Merging triggers `deploy-dashboard.yml` and `deploy-landing.yml` (expected: weekly-users dashboard, homepage without Pricing and without the GitHub button). All later work branches from that `main`.

## 6.1 Export exclude list
Owner decision (2026-10-20): private material keeps its history in `calens-private` and is simply not exported. No vault migration, no deletion in the private repo. Pure removals go into `.agents/plans/2026-10-17-free-with-donations/export-exclude.txt` (one path per line), which 6.5 applies. Starting list: `sales/`, `.lpm/`, `.claude/plans/cws-featured-badge.md`. 6.2 appends to it. Edits that improve the tree anyway (placeholders, relative paths) are made in the private repo and carried over.

## 6.2 Scrub (branch `open-source-prep`, inside `chrome-extension/`)
- **Supabase DB URL** in `docs/set-up.md` and `.claude/rules/supabase.md`: replace with `postgresql://postgres.{project-ref}:{url-encoded-password}@aws-1-ap-south-1.pooler.supabase.com:6543/postgres`.
- **PII**: `analytics/fixtures/cws_users.txt` holds emails. Replace with a synthetic fixture of the same shape (fake names/emails like `user1@example.com`), or delete it if nothing reads it in fixture mode. Check the other fixtures and `analytics/configs/*.json` for personal data.
- `analytics/scripts/extract-cookies.py` (browser cookie extraction): add to the exclude list if no remaining config uses cookie auth (check `auth.type` across configs); otherwise report.
- Absolute personal paths: `.claude/skills/cws-promo-tile/gen_promo.py` L4–7 and `store-assets/gen_promo_1400x560.py`: make them repo-relative.
- `.env.production`: drop the LemonSqueezy block (IDs are not secret but are dead). Keep `VITE_ENABLE_DEBUG_MODE=false`.
- Confirm the `ya29.` strings in `message-log.test.ts`, `diag-log.test.ts`, `error-utils.test.ts` are fakes. `src/lib/firebase-config.ts` holds a Firebase web API key: public by design (restricted by Firebase security rules), keep.
- Review `.claude/` (rules, skills) and `.agents/`: keep what helps contributors (rules, `verify-in-browser`, `cws-promo-tile`); drop internal-only notes. Keep this plan folder until step 04b is done (no secrets in it).

## 6.3 GitHub Actions
- `claude.yml`: gate every trigger on `author_association` ∈ {OWNER, MEMBER, COLLABORATOR} (`github.event.comment.author_association`, `github.event.review.author_association`, `github.event.issue.author_association`).
- `claude-code-review.yml`: run only for same-repo PRs (`github.event.pull_request.head.repo.full_name == github.repository`) from those associations.
- Others have no fork-PR secret exposure (no `pull_request_target`, no self-hosted runners).

## 6.4 Public-facing files (at what will be the root, i.e. `chrome-extension/` before 6.5)
- `LICENSE`: MIT, `Copyright (c) 2026 Quy Dinh`. Do not reuse `docs/ext/supabase/LICENSE`.
- `README.md`: rewrite the existing one for a public audience. What Calens is, CWS install link, a screenshot from `store-assets/`, features, privacy stance, dev setup (build, test, e2e, live harness), project layout, Support link (`SUPPORT_URL`), license.
- `.github/FUNDING.yml`: `github: dvquy13`.
- `SECURITY.md` (report privately via GitHub's private vulnerability reporting, enabled in 6.8; no public issues for vulnerabilities), short `CONTRIBUTING.md` (gates: typecheck, lint, test, test:e2e; Node 24 via `.nvmrc`).

## 6.5 Flatten into a staging tree
In a scratch dir (not inside the current repo):
1. `git archive main chrome-extension | tar -x --strip-components=1` → extension at root, then delete every path in `export-exclude.txt` (and the file itself).
2. Add `.github/workflows/*` from the old root, rewritten: drop `working-directory: chrome-extension`, `chrome-extension/` path prefixes, `cache-dependency-path` → `package-lock.json`, `paths:` filters, the zip step (`cd dist && zip -r ../calens.zip .`), and the wrangler CWD fix above (`deploy-dashboard.yml`, `fetch-metrics.yml`, `deploy-landing.yml`).
3. `.nvmrc` → root. Merge root `.gitignore` into the extension's (drop Next.js/Vercel entries). Drop the root `.env.example` (`NEXT_PUBLIC_*` is dead); keep the extension's.
4. Fix `chrome-extension/` path references: `CLAUDE.md`, `docs/cloudflare-deploy.md`, `docs/troubleshoots/debug-default-drag-broken.md`, `functions/eslint.config.js`, `scripts/verify-red.sh`, `store-assets/gen_promo_1400x560.py`, `.claude/skills/cws-promo-tile/gen_promo.py`, `docs/chrome-extension-feasibility-study.md` (historic: leave if it is narrative). Re-grep afterwards.
5. Gates in the staging tree: `npm ci`, `npm run typecheck`, `npm run lint`, `npm run test`, `npm run test:e2e`, `npm run build`, `npm --prefix functions ci && npm --prefix functions test`. `act` is not required; workflow YAML is checked with `actionlint` if available.

## 6.6 Secret scan
`brew install gitleaks`, then `gitleaks dir <staging> --redact -v` (or `detect --no-git` on older versions). Zero findings, or each finding explained as a false positive (e.g. Firebase web API key) and allowlisted in `.gitleaks.toml`.

## 6.7 Publish (human confirms each outward step)
1. `gh repo rename calens-private --repo dvquy13/calens`. GitHub redirects the old URL until a new repo takes the name.
2. In the staging tree: `git init -b main`, one commit "Calens: free and open source", `gh repo create dvquy13/calens --public --source . --push`.
3. Local layout: `mv /Users/dvq/frostmourne/calens /Users/dvq/frostmourne/calens-private`, then move the staging tree to `/Users/dvq/frostmourne/calens`. Copy untracked local essentials into it: `.env`, `credentials/`, `.calens-extension.pem`, `analytics/credentials/`, `.firebaserc` if untracked. Re-point the private clone's remote to `calens-private`.

## 6.8 Secrets + CI
- Recreate secrets on the new repo with `gh secret set` (values cannot be read back from the old repo; take them from local `.env`/credential files where they exist, otherwise the owner pastes them): `CWS_*`, `SUPABASE_*`, `CLOUDFLARE_*`, `GA4_SERVICE_ACCOUNT_JSON`, `GOOGLE_ADC_CREDENTIALS`, `DISCORD_WEBHOOK_URL`, `CLAUDE_CODE_OAUTH_TOKEN` (Telegram, LemonSqueezy and Netlify secrets are dead and not carried over). Get the exact list with `gh secret list --repo dvquy13/calens-private`.
- Enable private vulnerability reporting: `gh api -X PUT repos/dvquy13/calens/private-vulnerability-reporting`.
- `gh workflow disable` the scheduled/deploy workflows in `calens-private` so nothing double-runs.
- Verify: `test.yml` green on the initial commit; `make fetch-metrics` (dashboard deploy) green from the new repo.

## 6.9 Link it up
- Homepage `OpenSource.tsx`: add a "View on GitHub" button next to "Support Calens", URL as `GITHUB_REPO_URL` in `src/lib/links.ts` (held back in 03 so the landing page never linked to a private repo).
- CWS listing (agent browser, with the 4a release): add the repo link to the description; consider the support URL field → GitHub issues.
- Then release 4a from the new repo.

## 6.10 Supabase DB password (human)
Rotate in the Supabase dashboard → Database → reset password; update local `.env`/GitHub secrets if anything uses it (nothing in CI does today). Recommended because the old value sits in the private repo's history, but no longer a blocker: it never reaches the public repo.
