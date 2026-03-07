# CryptoTracker Backend — Deployment Guide

## Architecture

- **Runtime**: Cloudflare Worker (Hono)
- **Database**: Cloudflare D1 (SQLite)
- **Cache**: Cloudflare KV (price snapshots)
- **Auth**: Supabase HS256 JWT verification (Phase A)
- **Cron**: Cloudflare Triggers (every 2 min → price poll)

## Auth: Why HS256 + SUPABASE_JWT_SECRET

Supabase auth tokens are signed with **HS256** using the project's JWT secret.
This is consistent across all Supabase projects — you can verify by decoding any
access token header: `{"alg":"HS256","typ":"JWT"}`.

The JWT secret is found in your Supabase dashboard:
**Settings → API → JWT Secret** (the long base64 string, NOT the anon key).

The Worker verifies tokens using Web Crypto HMAC-SHA256 — no external libraries needed.

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
npx wrangler d1 execute crypto-tracker --local --file=../seed/schema.sql
```

### 3. Set local secrets

Create a `.dev.vars` file in `backend/`:

```env
SUPABASE_JWT_SECRET=your-jwt-secret-from-supabase-dashboard
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8788
```

### 4. Start the dev server

```bash
npx wrangler dev
# Server starts at http://localhost:8787
```

### 5. Run verification tests

```bash
# Without auth (tests public endpoints only):
bash test-local.sh

# With auth (tests all endpoints):
# Get a JWT from browser DevTools: Application → Local Storage → sb-*-auth-token → access_token
TEST_JWT="eyJ..." bash test-local.sh
```

---

## Remote Deployment

### 1. Create Cloudflare resources

```bash
# Create D1 database (returns a database_id)
npx wrangler d1 create crypto-tracker

# Create KV namespace (returns an id)
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
npx wrangler d1 execute crypto-tracker --remote --file=../seed/schema.sql
```

Verify it worked:

```bash
npx wrangler d1 execute crypto-tracker --remote --command="SELECT count(*) FROM assets"
```

### 4. Set production secrets

```bash
# JWT secret from Supabase Dashboard → Settings → API → JWT Secret
npx wrangler secret put SUPABASE_JWT_SECRET

# Comma-separated list of allowed frontend origins
npx wrangler secret put ALLOWED_ORIGINS
# Enter: https://coin-compass-calendar.lovable.app,https://your-custom-domain.com
```

### 5. Deploy

```bash
npx wrangler deploy
```

### 6. Verify remote deployment

```bash
WORKER_URL=https://cryptotracker-api.your-account.workers.dev bash test-local.sh
```

### 7. Connect the frontend

Set the environment variable in the Lovable project or `.env`:

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

### D1 schema not found / table doesn't exist
- Local: `npx wrangler d1 execute crypto-tracker --local --file=../seed/schema.sql`
- Remote: `npx wrangler d1 execute crypto-tracker --remote --file=../seed/schema.sql`
- The `--local` and `--remote` flags target different databases

### Prices returning null
- Expected before the first cron run
- Manually trigger: `curl -X POST https://your-worker.workers.dev/api/prices/poll` (if implemented)
- Or wait for the 2-minute cron cycle

### CORS errors
- Check `ALLOWED_ORIGINS` secret includes your frontend URL
- Must be comma-separated, no trailing slashes
