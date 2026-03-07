#!/usr/bin/env bash
# =============================================================
# CryptoTracker Backend — Local Verification Script
# =============================================================
# Prerequisites:
#   1. cd backend && npm install
#   2. Create local D1:  npm run db:init:local
#   3. Start dev server: npm run dev  (in another terminal)
#   4. Set TEST_JWT below (get a valid Supabase access token from browser DevTools)
#   5. Run:  bash test-local.sh
# =============================================================

set -euo pipefail

BASE="${WORKER_URL:-http://localhost:8787}"
TEST_JWT="${TEST_JWT:-}"
PASS=0
FAIL=0
RESULTS=()

red()   { printf "\033[31m%s\033[0m" "$1"; }
green() { printf "\033[32m%s\033[0m" "$1"; }
bold()  { printf "\033[1m%s\033[0m" "$1"; }

assert() {
  local name="$1" expected_status="$2" actual_status="$3" body="$4"
  if [[ "$actual_status" == "$expected_status" ]]; then
    RESULTS+=("$(green "✓") $name  (HTTP $actual_status)")
    ((PASS++)) || true
  else
    RESULTS+=("$(red "✗") $name  (expected $expected_status, got $actual_status)")
    RESULTS+=("    Response: ${body:0:200}")
    ((FAIL++)) || true
  fi
}

echo ""
bold "━━━ CryptoTracker Backend Verification ━━━"
echo ""
echo "Target: $BASE"
echo "JWT:    ${TEST_JWT:+set (${#TEST_JWT} chars)}${TEST_JWT:-NOT SET — auth tests will fail}"
echo ""

# ── 1. Health check ──────────────────────────────────────────────

RESP=$(curl -s -w "\n%{http_code}" "$BASE/api/status" 2>&1) || RESP=$'\n000'
BODY=$(echo "$RESP" | sed '$d')
CODE=$(echo "$RESP" | tail -1)
assert "GET /api/status" "200" "$CODE" "$BODY"

# ── 2. Public: GET /api/assets ───────────────────────────────────

RESP=$(curl -s -w "\n%{http_code}" "$BASE/api/assets" 2>&1) || RESP=$'\n000'
BODY=$(echo "$RESP" | sed '$d')
CODE=$(echo "$RESP" | tail -1)
assert "GET /api/assets (public)" "200" "$CODE" "$BODY"

# ── 3. Public: GET /api/prices (null/stale before cron) ──────────

RESP=$(curl -s -w "\n%{http_code}" "$BASE/api/prices" 2>&1) || RESP=$'\n000'
BODY=$(echo "$RESP" | sed '$d')
CODE=$(echo "$RESP" | tail -1)
assert "GET /api/prices (null/stale before cron)" "200" "$CODE" "$BODY"
echo "    Prices body: ${BODY:0:120}"

# ── 4. No-auth: GET /api/transactions → 401 ─────────────────────

RESP=$(curl -s -w "\n%{http_code}" "$BASE/api/transactions" 2>&1) || RESP=$'\n000'
BODY=$(echo "$RESP" | sed '$d')
CODE=$(echo "$RESP" | tail -1)
assert "GET /api/transactions (no auth → 401)" "401" "$CODE" "$BODY"

# ── 5. 404 for unknown routes ────────────────────────────────────

RESP=$(curl -s -w "\n%{http_code}" "$BASE/api/nonexistent" 2>&1) || RESP=$'\n000'
BODY=$(echo "$RESP" | sed '$d')
CODE=$(echo "$RESP" | tail -1)
assert "GET /api/nonexistent (→ 404)" "404" "$CODE" "$BODY"

# ── 6. Authenticated tests ───────────────────────────────────────

if [[ -z "$TEST_JWT" ]]; then
  echo ""
  echo "$(red "⚠")  Skipping authenticated tests — set TEST_JWT env var"
  echo "   Example: TEST_JWT=\$(pbpaste) bash test-local.sh"
  echo ""
else
  AUTH_HEADER="Authorization: Bearer $TEST_JWT"

  # GET /api/transactions (authed)
  RESP=$(curl -s -w "\n%{http_code}" -H "$AUTH_HEADER" "$BASE/api/transactions" 2>&1) || RESP=$'\n000'
  BODY=$(echo "$RESP" | sed '$d')
  CODE=$(echo "$RESP" | tail -1)
  assert "GET /api/transactions (authed)" "200" "$CODE" "$BODY"

  # Get a valid asset_id
  ASSET_ID=$(curl -s "$BASE/api/assets" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

  if [[ -z "$ASSET_ID" ]]; then
    echo "$(red "⚠")  No assets in D1. Seed first: npm run db:init:local"
  else
    echo "    Using asset_id: $ASSET_ID"

    # POST /api/transactions
    RESP=$(curl -s -w "\n%{http_code}" \
      -X POST \
      -H "$AUTH_HEADER" \
      -H "Content-Type: application/json" \
      -d "{\"asset_id\":\"$ASSET_ID\",\"timestamp\":\"2026-01-15T10:00:00Z\",\"type\":\"buy\",\"qty\":0.5,\"unit_price\":42000,\"fee_amount\":10,\"source\":\"test-script\"}" \
      "$BASE/api/transactions" 2>&1) || RESP=$'\n000'
    BODY=$(echo "$RESP" | sed '$d')
    CODE=$(echo "$RESP" | tail -1)
    assert "POST /api/transactions" "201" "$CODE" "$BODY"

    TX_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

    if [[ -n "$TX_ID" ]]; then
      echo "    Created tx_id: $TX_ID"

      # PUT /api/transactions/:id
      RESP=$(curl -s -w "\n%{http_code}" \
        -X PUT \
        -H "$AUTH_HEADER" \
        -H "Content-Type: application/json" \
        -d "{\"note\":\"updated by test script\",\"qty\":0.75}" \
        "$BASE/api/transactions/$TX_ID" 2>&1) || RESP=$'\n000'
      BODY=$(echo "$RESP" | sed '$d')
      CODE=$(echo "$RESP" | tail -1)
      assert "PUT /api/transactions/:id" "200" "$CODE" "$BODY"

      # DELETE /api/transactions/:id
      RESP=$(curl -s -w "\n%{http_code}" \
        -X DELETE \
        -H "$AUTH_HEADER" \
        "$BASE/api/transactions/$TX_ID" 2>&1) || RESP=$'\n000'
      BODY=$(echo "$RESP" | sed '$d')
      CODE=$(echo "$RESP" | tail -1)
      assert "DELETE /api/transactions/:id" "200" "$CODE" "$BODY"

      # DELETE same tx again → 404
      RESP=$(curl -s -w "\n%{http_code}" \
        -X DELETE \
        -H "$AUTH_HEADER" \
        "$BASE/api/transactions/$TX_ID" 2>&1) || RESP=$'\n000'
      BODY=$(echo "$RESP" | sed '$d')
      CODE=$(echo "$RESP" | tail -1)
      assert "DELETE /api/transactions/:id (already deleted → 404)" "404" "$CODE" "$BODY"
    fi

    # POST /api/imported-files (first insert)
    UNIQUE_HASH="test-hash-$(date +%s)"
    RESP=$(curl -s -w "\n%{http_code}" \
      -X POST \
      -H "$AUTH_HEADER" \
      -H "Content-Type: application/json" \
      -d "{\"file_name\":\"test-export.csv\",\"file_hash\":\"$UNIQUE_HASH\",\"exchange\":\"binance\",\"export_type\":\"spot\",\"row_count\":42}" \
      "$BASE/api/imported-files" 2>&1) || RESP=$'\n000'
    BODY=$(echo "$RESP" | sed '$d')
    CODE=$(echo "$RESP" | tail -1)
    assert "POST /api/imported-files (first insert)" "201" "$CODE" "$BODY"

    # POST /api/imported-files (duplicate → 409)
    RESP=$(curl -s -w "\n%{http_code}" \
      -X POST \
      -H "$AUTH_HEADER" \
      -H "Content-Type: application/json" \
      -d "{\"file_name\":\"test-export.csv\",\"file_hash\":\"$UNIQUE_HASH\",\"exchange\":\"binance\",\"export_type\":\"spot\",\"row_count\":42}" \
      "$BASE/api/imported-files" 2>&1) || RESP=$'\n000'
    BODY=$(echo "$RESP" | sed '$d')
    CODE=$(echo "$RESP" | tail -1)
    assert "POST /api/imported-files (duplicate → 409)" "409" "$CODE" "$BODY"
  fi
fi

# ── Results ──────────────────────────────────────────────────────

echo ""
bold "━━━ Results ━━━"
echo ""
for r in "${RESULTS[@]}"; do
  echo "  $r"
done
echo ""
echo "  $(green "$PASS passed"), $(red "$FAIL failed")"
echo ""

exit $FAIL
