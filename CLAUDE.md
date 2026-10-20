Calens is a Google Chrome extension for Google Calendar that aims to provide analytics and add-ons to enhance users productivity and helps them manage their time effectively.

## Development

Use `npm run build-dev` to build the extension in development mode. Node 24 everywhere: the repo-root `.nvmrc` is the single source for CI (`node-version-file`), local dev and the Cloud Functions runtime (`functions/package.json` engines, exact major). After a rebuild, click reload on Calens in `chrome://extensions`: an open side panel picks up the new `dist/` files, but the old service worker keeps running, so new message types get no answer (Diagnostics then reports "background service didn't respond").

Gates: `npm run typecheck` and `npm run lint` are both at 0 errors — keep them there. `build-dev`/`build` end with `scripts/check-content-bundles.mjs`, which fails if a built content script contains `import`/`export` (content scripts aren't ES modules; a module shared by two content entries gets split into a chunk).

Google Calendar's DOM is undocumented; live-verified facts (shortened calendar IDs in `data-eventid`, dialog/popover markup, Save/Discard timing) live in `docs/google-calendar-dom.md`. Check it before writing code or fixtures that read Google's DOM, and update it (with dates) when you verify something new.

Diagnostics: new code logs through `diag()` (SW: `lib/diag-log.ts`; panel: `lib/diag-panel.ts`; content: `content/diag.ts`, event-enhancer graph only), never by writing `diag_log` directly, and never puts titles, emails or tokens in `msg`. Rules and the report flow: `docs/patterns-and-decisions.md` ("Diagnostics & User Reports").

> ⚠️ **Post-production-build gotcha:** `npm run build` (for CWS) leaves `dist/` with a keyless manifest (`scripts/manifest-plugin.ts` drops `key` in production). Loading that `dist/` makes Chrome assign a random extension ID, and OAuth fails with "bad client id". Run `npm run build-dev` before testing locally after a production build.

## Testing

- `npm run test` — Vitest unit tests.
- `npm run test:e2e` — Playwright E2E tests against the real `dist/` build (builds it first). Fully offline: no live Google account needed, `calendar.google.com`/Calendar API are mocked; build Google markup with `e2e/fixtures/gcal-dom.ts`. See `.claude/rules/e2e-testing.md` for the harness's gotchas before touching `e2e/`.
- `npm run agent:browser -- <cmd>` — **live** verification: a dedicated, human-signed-in branded Chrome profile driven over a fixed CDP port (plus the `calens-browser` Playwright MCP in `.mcp.json`). Use the `verify-in-browser` skill for the workflow. Never launch Chrome for live Google through Playwright/Puppeteer (`launchPersistentContext`, `chrome-devtools-mcp`'s own launch): their pipe/port-0 launch sets `navigator.webdriver = true`, and their `--use-mock-keychain` most likely makes the saved session look logged out. Attach to a Chrome started with a fixed `--remote-debugging-port` instead. Details in `docs/patterns-and-decisions.md` ("Live-Auth Agent Browser Harness").
- `scripts/verify-red.sh [--ref main] [--rebuild] <files>… -- <test cmd>` — prove a regression test fails on the old code and passes on the fix (swaps in `<ref>`'s files, runs, always restores).

## Metrics dashboard

`dashboard.html` is the analytics dashboard, live at **https://dashboard.calens.dev**.

Deploys are triggered automatically:
- **Code changes** to `dashboard.html` → `deploy-dashboard.yml` runs sed + `wrangler pages deploy`
- **Daily metrics run** → `fetch-metrics.yml` builds the artifact (sed → stamp → deploy); **no commit back to main**

**Stamp architecture:** `dashboard.html` in `main` is a pure template with no metrics snapshot. `analytics/scripts/stamp-dashboard.py` inserts the snapshot `<noscript>` block into `_site/index.html` (the deploy artifact) at CI time — never committed to source. This keeps `main` clean and eliminates `git pull` friction from daily CI runs.

To redeploy manually, trigger the workflow:
```bash
gh workflow run "Deploy Dashboard" --repo dvquy13/calens
```

`dashboard.html` uses `__SUPABASE_URL__` and `__SUPABASE_KEY__` placeholders. These are injected at build time via `sed` — the source file intentionally has no real credentials.

To preview locally (placeholders won't load data — use the live URL instead):
```bash
python3 -m http.server 3000
# open http://localhost:3000/dashboard.html
```

Metrics are fetched and pushed to Supabase daily by GitHub Actions (`.github/workflows/fetch-metrics.yml` at repo root, runs 20:13 UTC = 03:13 GMT+7). To trigger manually:

```bash
make fetch-metrics   # triggers CI run and watches live output
```

Or run locally:
```bash
cd analytics
uv run scripts/fetch-metrics.py | SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... uv run scripts/push-and-notify.py
```

> ⚠️ **CI env gotcha:** every secret used by a workflow step must be explicitly listed in that step's `env:` block — GitHub does not auto-inject secrets even if they exist in repo settings.

Metrics pipeline scripts and configs live in `analytics/` (see `analytics/alerts.yaml` and `analytics/configs/`).

## Cloudflare Pages deploy

> ⚠️ **wrangler CWD gotcha:** Run `wrangler pages deploy` from **inside the output directory** (`cd _site && npx wrangler pages deploy . …`), never from the repo root. The Firebase `functions/` dir sits at the root, and wrangler treats a `functions/` dir in its CWD as Pages Functions and fails with bundling errors.

See `docs/cloudflare-deploy.md` for project names, DNS details, token permissions, and manual redeploy commands.

## Chrome Web Store releases

Workflow: `.github/workflows/deploy-extension.yml`, triggered by `v*` tags.

**To release:** `git tag vX.Y.Z && git push origin vX.Y.Z` — CI stamps the version from the tag into `manifest.json` automatically before building.

See `docs/cws-deploy.md` for troubleshooting (account split, refresh token rotation, API enable).

## References

- The [README](./README.md) provides an overview of the project file structure to help navigate the codebase.
