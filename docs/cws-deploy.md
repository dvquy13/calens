# Chrome Web Store Deploy

CI workflow: `.github/workflows/deploy-extension.yml` — triggers on `v*` tags or `workflow_dispatch`. Builds, zips `dist/`, uploads, and submits for review.

## Release checklist

1. `git tag vX.Y.Z && git push origin vX.Y.Z` (must be strictly higher than the published version)

**Listing changes with a release** (verified 2026-10-20 with v0.0.3.0): edit the listing, privacy or distribution pages in the developer dashboard and click "Save draft" (Vietnamese UI: "Lưu bản nháp") *before* tagging. CI's publish call submits the whole draft, so the listing changes go into review together with the new package. Afterwards the item status page shows the draft as pending review and no separate "Submit for review" is needed. The dashboard has no API: agents drive it through the agent browser, signed in as the CWS owner account.

CI's "Stamp version from tag" step writes the tag's version into `public/manifest.json` before building and never commits it back. The source manifest therefore stays at `0.0.2.0`; `build-dev` instead takes the version from the latest `v*` tag and shows it as `<tag>-dev` in the panel footer (`scripts/manifest-plugin.ts`). Any CI job that runs `build-dev` (incl. `test:e2e`) should use `actions/checkout` with `fetch-depth: 0`: without a `v*` tag (shallow clone, fresh fork) the dev build warns and falls back to the source version. `workflow_dispatch` runs skip the stamp, so they upload `0.0.2.0`, which CWS rejects.

Checking the released build: the dev manifest's `key` gives the unpacked `dist/` the same ID as the listing (`celfolmbbepfnnmchmfojakakipnmenk`). In a profile that has the unpacked build loaded, it replaces the store install. Use another Chrome profile, or remove the unpacked build, to see the published version.

## Account split

Two Google accounts are involved — do not mix them up:

| Account | Role |
|---|---|
| `<gcp-owner-email>` | Owns the GCP project (`personal-calendar-ai-assistant`). OAuth Desktop App client for CWS API lives here. |
| `<cws-owner-email>` | Owns the CWS developer account and the extension listing (`celfolmbbepfnnmchmfojakakipnmenk`). |

## Rotating CWS_REFRESH_TOKEN

`CWS_REFRESH_TOKEN` must be authorized by `<cws-owner-email>`. Symptom if wrong: `403 Forbidden` on upload (distinct from `SERVICE_DISABLED`).

```bash
python3 -c "
from google_auth_oauthlib.flow import InstalledAppFlow
flow = InstalledAppFlow.from_client_secrets_file(
    'credentials/<desktop-client-secret>.json',
    scopes=['https://www.googleapis.com/auth/chromewebstore'])
creds = flow.run_local_server(port=0)
print('REFRESH_TOKEN:', creds.refresh_token)
"
# Sign in as <cws-owner-email> when the browser opens
gh secret set CWS_REFRESH_TOKEN --body "<token>"
```

## Chrome Web Store API disabled

Symptom: `SERVICE_DISABLED` error on upload. Fix:

```bash
gcloud --project=<gcp-project-id> --account=<gcp-owner-email> \
  services enable chromewebstore.googleapis.com
```

Already enabled as of 2026-04-17 — only needed again if the project is recreated.

## Landing page (calens.dev)

`homepage.html` is a Vite entry point — deploying it raw produces a blank page. The `deploy-landing.yml` workflow handles this correctly (runs `npm run build` first). Manual redeploy:

```bash
npm run build
mkdir -p /tmp/landing
cp -r dist/. /tmp/landing/
cp /tmp/landing/homepage.html /tmp/landing/index.html
npx wrangler pages deploy /tmp/landing --project-name=calens-landing --branch=main
```
