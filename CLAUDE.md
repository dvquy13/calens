Calens is a Google Chrome extension for Google Calendar that aims to provide analytics and add-ons to enhance users productivity and helps them manage their time effectively.

**This repo is public** (MIT, free product, donations via GitHub Sponsors). Never commit credentials, personal emails or private business material; local secrets live in gitignored `.env`, `analytics/.env` and `credentials/`. Before publishing anything that might carry a secret, run `gitleaks dir . --redact` (`.gitleaksignore` lists the one public-by-design value, the manifest's RSA public key). History before 2026-10-20 is in the private archive `dvquy13/calens-private`, whose workflows are disabled.

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

## Metrics dashboard and deploys

`dashboard.html` (https://dashboard.calens.dev) and `analytics/` are a daily metrics pipeline; see `docs/metrics.md` before touching them. Both sites (calens.dev, the dashboard) deploy to Cloudflare Pages from CI; manual `wrangler` use has a CWD gotcha, see `docs/cloudflare-deploy.md`.

## Chrome Web Store releases

Workflow: `.github/workflows/deploy-extension.yml`, triggered by `v*` tags.

**To release:** `git tag vX.Y.Z && git push origin vX.Y.Z` — CI stamps the version from the tag into `manifest.json` automatically before building.

Store listing, privacy and distribution changes have no API: save them as a draft in the developer dashboard *before* tagging, and the release submits them with the package. See `docs/cws-deploy.md` (also: account split, refresh token rotation, API enable).

## References

- The [README](./README.md) provides an overview of the project file structure to help navigate the codebase.
