# CryptoTracker Backend — Deployment Guide

## Architecture

- **Runtime**: Cloudflare Worker (Hono)
- **Database**: Cloudflare D1 (SQLite)
- **Cache**: Cloudflare KV (price snapshots)
- **Auth**: Supabase JWT verification via HS256 shared secret (Phase A — see note below)
- **Cron**: Cloudflare Triggers (every 2 min → price poll)

## Auth: HS256 Shared-Secret Verification (Temporary Compatibility Path)

> **Important caveat**: This project currently appears to use Supabase's legacy
> HS256/shared-secret JWT signing. The Worker's `auth.ts` middleware verifies
> tokens using HMAC-SHA256 with `SUPABASE_JWT_SECRET`.
>
> **This is a temporary compatibility path, not a future-proof verification strategy.**
>
> If the Supabase project migrates to [JWT signing keys (JWKS / RS256)](https://supabase.com/docs/guides/auth/jwts#signing-keys),
> the auth middleware must be updated to fetch the JWKS endpoint and verify
> RS256 signatures instead. Monitor for changes in your Supabase project's
> Settings → API → JWT Configuration.

The JWT secret is found in your Supabase dashboard:
**Settings → API → JWT Secret** (the long base64 string, NOT the anon key).

---

## Local Development

### 1. Install dependencies

```bash
cd backend
npm install
```

### 2. Create local D1 database + seed schema

```bash
# --local flag creates a local SQLite file for development
npm run db:init:local
# Equivalent to:
#   npx wrangler d1 execute crypto-tracker --local --file=../seed/schema.sql
#   npx wrangler d1 execute crypto-tracker --local --file=../seed/assets.sql
```
```

### 3. Set local secrets

Create a `.dev.vars` file in `backend/`:

```env
SUPABASE_JWT_SECRET=your-jwt-secret-from-supabase-dashboard
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8788
```

### 4. Start the dev server

```bash
npm run dev
# Server starts at http://localhost:8787
```

### 5. Run verification tests

```bash
# Public endpoints only (no JWT needed):
bash test-local.sh

# All endpoints including auth:
# Get JWT from browser DevTools: Application → Local Storage → sb-*-auth-token → access_token
TEST_JWT="eyJ..." bash test-local.sh

# Against a remote deployment:
WORKER_URL=https://your-worker.workers.dev TEST_JWT="eyJ..." bash test-local.sh
```

---

## Remote Deployment

### 1. Create Cloudflare resources

```bash
# Create D1 database — note the database_id in the output
npx wrangler d1 create crypto-tracker

# Create KV namespace — note the id in the output
npx wrangler kv namespace create PRICE_KV
```

### 2. Update wrangler.toml

Replace the placeholder IDs with the real values from step 1:

```toml
[[d1_databases]]
binding         = "DB"
database_name   = "crypto-tracker"
database_id     = "your-real-d1-database-id"   # ← from step 1

[[kv_namespaces]]
binding = "PRICE_KV"
id      = "your-real-kv-namespace-id"          # ← from step 1
```

### 3. Seed the REMOTE D1 database

```bash
# ⚠️ --remote flag is REQUIRED to execute against production D1
npm run db:init:remote
# Equivalent to: npx wrangler d1 execute crypto-tracker --remote --file=../seed/schema.sql
```

Verify it worked:

```bash
npx wrangler d1 execute crypto-tracker --remote --command="SELECT count(*) FROM assets"
```

### 4. Set production secrets

```bash
# JWT secret from Supabase Dashboard → Settings → API → JWT Secret
# ⚠️ This is the HS256 shared secret. See auth caveat above.
npx wrangler secret put SUPABASE_JWT_SECRET

# Comma-separated list of allowed frontend origins
npx wrangler secret put ALLOWED_ORIGINS
# Enter: https://coin-compass-calendar.lovable.app,https://your-custom-domain.com
```

### 5. Deploy

```bash
npm run deploy
# Or: npx wrangler deploy
```

### 6. Verify remote deployment

```bash
WORKER_URL=https://cryptotracker-api.your-account.workers.dev TEST_JWT="eyJ..." bash test-local.sh
```

### 7. Connect the frontend

Set the environment variable in the Lovable project:

```
VITE_WORKER_API_URL=https://cryptotracker-api.your-account.workers.dev
```

---

## CI/CD (GitHub Actions)

The workflow `.github/workflows/deploy-backend.yml` auto-deploys on push to `main`
when files in `backend/` change.

Required GitHub Secrets:
- `CLOUDFLARE_API_TOKEN` — API token with Workers/D1/KV permissions
- `CLOUDFLARE_ACCOUNT_ID` — Your Cloudflare account ID

---

## Troubleshooting

### "Invalid signature" on authenticated requests
- Verify `SUPABASE_JWT_SECRET` matches your Supabase project (Settings → API → JWT Secret)
- Ensure the token hasn't expired (Supabase tokens expire after 1 hour by default)
- Check the token is from the correct Supabase project
- If the project has migrated to JWKS/RS256, the HS256 middleware will fail — see auth caveat above

### D1 schema not found / table doesn't exist
- Local: `npm run db:init:local`
- Remote: `npm run db:init:remote`
- The `--local` and `--remote` flags target completely different databases

### Prices returning null
- Expected before the first cron run
- Wait for the 2-minute cron cycle, or check `GET /api/status` for last update time

### CORS errors
- Check `ALLOWED_ORIGINS` secret includes your frontend URL
- Must be comma-separated, no trailing slashes
