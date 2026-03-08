# CryptoTracker Backend — Deployment Guide

## Architecture

- **Runtime**: Cloudflare Worker (Hono)
- **Database**: Cloudflare D1 (SQLite)
- **Cache**: Cloudflare KV (price snapshots)
- **Auth**: Clerk RS256 JWT verification via JWKS endpoint
- **Cron**: Cloudflare Triggers (every 2 min → price poll)

## Auth: Clerk RS256 JWKS Verification

The Worker verifies Clerk-issued RS256 JWTs by fetching the JSON Web Key Set
from the Clerk JWKS endpoint. The `CLERK_JWKS_URL` secret must be set to
`https://<your-clerk-domain>/.well-known/jwks.json`.

No Supabase auth is used anywhere in the stack.

---

## Local Development

### 1. Install dependencies

```bash
cd backend
npm install
```

### 2. Create local D1 database + seed schema

```bash
npm run db:init:local
```

### 3. Set local secrets

Create a `.dev.vars` file in `backend/`:

```env
CLERK_JWKS_URL=https://<your-clerk-domain>/.well-known/jwks.json
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8788
```

### 4. Start the dev server

```bash
npm run dev
# Server starts at http://localhost:8787
```

### 5. Run verification tests

```bash
bash test-local.sh
```

---

## Remote Deployment

### 1. Create Cloudflare resources

```bash
npx wrangler d1 create crypto-tracker
npx wrangler kv namespace create PRICE_KV
```

### 2. Update wrangler.toml

Replace placeholder IDs with the real values from step 1.

### 3. Seed the remote D1 database

```bash
npm run db:init:remote
```

### 4. Set production secrets

```bash
npx wrangler secret put CLERK_JWKS_URL
# Enter: https://<your-clerk-domain>/.well-known/jwks.json

npx wrangler secret put ALLOWED_ORIGINS
# Enter: https://coin-compass-calendar.lovable.app,https://id-preview--2cfe2472-7c29-496d-8af8-dbef09ba09f3.lovable.app
```

### 5. Deploy

```bash
npm run deploy
```

### 6. Connect the frontend

Set `VITE_WORKER_API_URL` in the Lovable project secrets.

---

## CI/CD (GitHub Actions)

The workflow `.github/workflows/deploy-backend.yml` auto-deploys on push to `main`
when files in `backend/` change.

Required GitHub Secrets:
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

---

## Troubleshooting

### "Invalid signature" on authenticated requests
- Verify `CLERK_JWKS_URL` is set and points to your Clerk domain's JWKS endpoint
- Ensure the token hasn't expired
- Check the Clerk dashboard for the correct JWKS URL

### CORS errors
- Check `ALLOWED_ORIGINS` secret includes your frontend URL
- Must be comma-separated, no trailing slashes
