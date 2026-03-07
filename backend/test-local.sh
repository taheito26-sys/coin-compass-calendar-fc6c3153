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

set -uo pipefail
# NOTE: no `set -e` — we never abort early so the final summary always prints.

BASE="${WORKER_URL:-http://localhost:8788}"
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

# Safe curl wrapper — never exits on failure
do_curl() {
  local resp
  resp=$(curl -s -w "\n%{http_code}" "$@" 2>&1) || resp=$'\n000'
  echo "$resp"
}

echo ""
bold "━━━ CryptoTracker Backend Verification ━━━"
echo ""
echo "Target: $BASE"
echo "JWT:    ${TEST_JWT:+set (${#TEST_JWT} chars)}${TEST_JWT:-NOT SET — auth tests will show failures}"
echo ""

# ── 1. Health check ──────────────────────────────────────────────

RESP=$(do_curl "$BASE/api/status")
BODY=$(echo "$RESP" | sed '$d')
CODE=$(echo "$RESP" | tail -1)
assert "GET /api/status" "200" "$CODE" "$BODY"

# ── 2. Public: GET /api/assets ───────────────────────────────────

RESP=$(do_curl "$BASE/api/assets")
BODY=$(echo "$RESP" | sed '$d')
CODE=$(echo "$RESP" | tail -1)
assert "GET /api/assets (public)" "200" "$CODE" "$BODY"

# ── 3. Public: GET /api/prices ───────────────────────────────────

RESP=$(do_curl "$BASE/api/prices")
BODY=$(echo "$RESP" | sed '$d')
CODE=$(echo "$RESP" | tail -1)
assert "GET /api/prices (public)" "200" "$CODE" "$BODY"
echo "    Prices body: ${BODY:0:120}"

# ── 4. No-auth: GET /api/transactions → 401 ─────────────────────

RESP=$(do_curl "$BASE/api/transactions")
BODY=$(echo "$RESP" | sed '$d')
CODE=$(echo "$RESP" | tail -1)
assert "GET /api/transactions (no auth → 401)" "401" "$CODE" "$BODY"

# ── 5. 404 for unknown routes ────────────────────────────────────

RESP=$(do_curl "$BASE/api/nonexistent")
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
  RESP=$(do_curl -H "$AUTH_HEADER" "$BASE/api/transactions")
  BODY=$(echo "$RESP" | sed '$d')
  CODE=$(echo "$RESP" | tail -1)
  assert "GET /api/transactions (authed)" "200" "$CODE" "$BODY"

  # Get a valid asset_id (best-effort, don't abort if empty)
  ASSET_ID=$(curl -s "$BASE/api/assets" 2>/dev/null | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4) || true

  if [[ -z "$ASSET_ID" ]]; then
    echo "$(red "⚠")  No assets in D1 — seed first. Skipping write tests."
    RESULTS+=("$(red "✗") POST /api/transactions  (skipped: no assets)")
    ((FAIL++)) || true
  else
    echo "    Using asset_id: $ASSET_ID"

    # POST /api/transactions
    RESP=$(do_curl \
      -X POST \
      -H "$AUTH_HEADER" \
      -H "Content-Type: application/json" \
      -d "{\"asset_id\":\"$ASSET_ID\",\"timestamp\":\"2026-01-15T10:00:00Z\",\"type\":\"buy\",\"qty\":0.5,\"unit_price\":42000,\"fee_amount\":10,\"source\":\"test-script\"}" \
      "$BASE/api/transactions")
    BODY=$(echo "$RESP" | sed '$d')
    CODE=$(echo "$RESP" | tail -1)
    assert "POST /api/transactions" "201" "$CODE" "$BODY"

    TX_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4) || true

    if [[ -z "$TX_ID" ]]; then
      echo "    $(red "⚠") Could not extract tx_id — skipping PUT/DELETE tests"
      RESULTS+=("$(red "✗") PUT /api/transactions/:id  (skipped: no tx_id)")
      RESULTS+=("$(red "✗") DELETE /api/transactions/:id  (skipped: no tx_id)")
      ((FAIL+=2)) || true
    else
      echo "    Created tx_id: $TX_ID"

      # PUT /api/transactions/:id
      RESP=$(do_curl \
        -X PUT \
        -H "$AUTH_HEADER" \
        -H "Content-Type: application/json" \
        -d "{\"note\":\"updated by test script\",\"qty\":0.75}" \
        "$BASE/api/transactions/$TX_ID")
      BODY=$(echo "$RESP" | sed '$d')
      CODE=$(echo "$RESP" | tail -1)
      assert "PUT /api/transactions/:id" "200" "$CODE" "$BODY"

      # DELETE /api/transactions/:id
      RESP=$(do_curl -X DELETE -H "$AUTH_HEADER" "$BASE/api/transactions/$TX_ID")
      BODY=$(echo "$RESP" | sed '$d')
      CODE=$(echo "$RESP" | tail -1)
      assert "DELETE /api/transactions/:id" "200" "$CODE" "$BODY"

      # DELETE same tx again → 404
      RESP=$(do_curl -X DELETE -H "$AUTH_HEADER" "$BASE/api/transactions/$TX_ID")
      BODY=$(echo "$RESP" | sed '$d')
      CODE=$(echo "$RESP" | tail -1)
      assert "DELETE /api/transactions/:id (already deleted → 404)" "404" "$CODE" "$BODY"
    fi

    # POST /api/imported-files (first insert)
    UNIQUE_HASH="test-hash-$(date +%s)"
    RESP=$(do_curl \
      -X POST \
      -H "$AUTH_HEADER" \
      -H "Content-Type: application/json" \
      -d "{\"file_name\":\"test-export.csv\",\"file_hash\":\"$UNIQUE_HASH\",\"exchange\":\"binance\",\"export_type\":\"spot\",\"row_count\":42}" \
      "$BASE/api/imported-files")
    BODY=$(echo "$RESP" | sed '$d')
    CODE=$(echo "$RESP" | tail -1)
    assert "POST /api/imported-files (first insert)" "201" "$CODE" "$BODY"

    # POST /api/imported-files (duplicate → 409)
    RESP=$(do_curl \
      -X POST \
      -H "$AUTH_HEADER" \
      -H "Content-Type: application/json" \
      -d "{\"file_name\":\"test-export.csv\",\"file_hash\":\"$UNIQUE_HASH\",\"exchange\":\"binance\",\"export_type\":\"spot\",\"row_count\":42}" \
      "$BASE/api/imported-files")
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
