# Cloudflare Pages Deploy

Calens uses Cloudflare Pages for both sites (migrated from Netlify 2026-04-19 — Netlify's credit system ran out from GitHub repo connections triggering Netlify-managed builds on every push).

## Projects

| Project | Domain | Deployed by |
|---|---|---|
| `calens-landing` | calens.dev | `deploy-landing.yml` (on homepage.html changes) |
| `calens-dashboard` | dashboard.calens.dev | `deploy-dashboard.yml` (on dashboard.html changes) + `fetch-metrics.yml` (daily) |

## DNS

Zone `calens.dev` is managed in Cloudflare (zone id: `c7719ade874ff806355b6b0f33a4be21`).
Nameservers in Namecheap set to: `chase.ns.cloudflare.com` + `jade.ns.cloudflare.com`.

## Deploy pattern

All three deploy workflows run `wrangler pages deploy` from **inside the output directory**, deploying `.`:

```bash
cd _site && npx wrangler pages deploy . --project-name=calens-dashboard --branch=main
```

Required env vars: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

> ⚠️ **wrangler CWD gotcha:** The Firebase `functions/` dir sits at the repo root. Running `wrangler pages deploy` from the repo root makes wrangler pick it up as Pages Functions and fail with bundling errors. Always deploy from inside the output directory (`cd _site`).

## API token permissions

The Cloudflare API token (stored in `.env` as `CLOUDFLARE_API_TOKEN`) needs **all three**:
- `Cloudflare Pages: Edit`
- `Zone: Edit`
- `DNS: Edit`

Missing `DNS: Edit` causes auth errors on DNS record endpoints even when `Zone: Edit` is present — they are separate permission scopes.

## Manual redeploy

```bash
gh workflow run "Deploy Dashboard" --repo dvquy13/calens
gh workflow run "Deploy Landing Page" --repo dvquy13/calens
```

Both workflows have `workflow_dispatch` — add it to any new deploy workflows too, or you'll have to push a no-op commit to test them.

## Custom domain certificate provisioning

After adding a custom domain to a Pages project via API, the SSL certificate takes **5–15 minutes** to provision. The domain status goes: `initializing → pending → active`. During this window, browsers show `ERR_SSL_VERSION_OR_CIPHER_MISMATCH`. If it gets stuck on `pending`, delete and re-add the domain via API to restart verification.
