## Setup Instructions

### 1. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing one
3. Enable the Google Calendar API:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Calendar API"
   - Click "Enable"
4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth 2.0 Client IDs"
   - Application type: "Web application"
   - Add authorized redirect URIs:
     - `chrome-extension://YOUR_EXTENSION_ID/` (get this after loading extension)
   - Note down your Client ID and Client Secret

### 2. Extension Setup

1. **Clone and Install**
   ```bash
   npm install
   ```

2. **Environment Configuration**
   ```bash
   # Copy the example environment file
   cp .env.example .env
   
   # Edit .env with your Google OAuth credentials
   VITE_GOOGLE_CLIENT_ID=your_google_client_id
   VITE_GOOGLE_CLIENT_SECRET=your_google_client_secret
   ```

3. **Build the Extension**
   ```bash
   npm run build-dev
   ```

4. **Load in Chrome**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked" and select the `dist/` folder
   - Note the extension ID from the loaded extension

5. **Update Google Cloud Console**
   - Add your extension's redirect URI: `chrome-extension://YOUR_EXTENSION_ID/`
   - Make sure the Calendar API is enabled

6. **Test the Extension**
   - Click the extension icon in Chrome toolbar
   - Click "Sign in with Google"
   - Authorize calendar access
   - View your real calendar analytics!

---

### 3. Supabase Analytics Setup

Project: `calens-analytics` · URL: `https://wzacvfhfpqhdutqfcofz.supabase.co`

**API Keys (new-style):**
Supabase replaced legacy `anon`/`service_role` JWT keys with publishable/secret keys.
- Use `sb_publishable_...` (from the "Publishable and secret API keys" tab) wherever you previously used the `anon` key.
- Safe to hardcode — same security model. Use in both `apikey` header and `Authorization: Bearer` header.
- Do NOT use the "Legacy anon, service_role API keys" tab for new code.

**Push schema migrations:**
```bash
# & and $ in the password must be URL-encoded (%26 and %24)
supabase db push --db-url "postgresql://postgres.{project-ref}:{url-encoded-password}@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"
```

**Set secrets (values are unrecoverable after setting — save to .env first):**
```bash
supabase secrets set METRICS_API_KEY="$(openssl rand -hex 32)"
supabase secrets set FIREBASE_SERVICE_ACCOUNT_JSON="$(cat credentials/calens-chrome-ext-firebase-adminsdk-fbsvc-c60db0742d.json)"
supabase secrets set GA4_PROPERTY_ID=528344311
```

**Deploy Edge Functions:**
```bash
supabase functions deploy daily-metrics-snapshot --no-verify-jwt
supabase functions deploy track-install --no-verify-jwt
```
(`--no-verify-jwt` required because functions use custom `METRICS_API_KEY` Bearer auth, not Supabase JWTs.)

**Schedule cron (paste into Supabase SQL Editor once):**
```sql
select cron.schedule(
  'daily-metrics-snapshot',
  '0 0 * * *',
  $$
  select net.http_post(
    url     := 'https://wzacvfhfpqhdutqfcofz.supabase.co/functions/v1/daily-metrics-snapshot',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.metrics_api_key')),
    body    := '{}'::jsonb
  );
  $$
);
alter database postgres set app.metrics_api_key = '<METRICS_API_KEY from .env>';
```

**Open dashboard:** https://dashboard.calens.dev