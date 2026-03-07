#!/usr/bin/env bash
# =============================================================
# CryptoTracker Backend — Local Verification Script
# =============================================================
# Prerequisites:
#   1. cd backend && npm install
#   2. Create local D1:  npx wrangler d1 execute crypto-tracker --local --file=../seed/schema.sql
#   3. Start dev server: npx wrangler dev  (in another terminal)
#   4. Set TEST_JWT below (get a valid Supabase access token from your browser DevTools)
#   5. Run:  bash test-local.sh
# =============================================================

set -euo pipefail

BASE="${WORKER_URL:-http://localhost:8787}"
TEST_JWT="${TEST_JWT:-}"
PASS=0
FAIL=0
RESULTS=()

# ── Helpers ──────────────────────────────────────────────────────

red()   { printf "\033[31m%s\033[0m" "$1"; }
green() { printf "\033[32m%s\033[0m" "$1"; }
bold()  { printf "\033[1m%s\033[0m" "$1"; }

assert() {
  local name="$1" expected_status="$2" actual_status="$3" body="$4"
  if [[ "$actual_status" == "$expected_status" ]]; then
    RESULTS+=("$(green "✓") $name  (HTTP $actual_status)")
    ((PASS++))
  else
    RESULTS+=("$(red "✗") $name  (expected $expected_status, got $actual_status)")
    RESULTS+=("    Response: ${body:0:200}")
    ((FAIL++))
  fi
}

auth_header() {
  if [[ -n "$TEST_JWT" ]]; then
    echo "Authorization: Bearer $TEST_JWT"
  else
    echo "X-No-Auth: true"
  fi
}

# ── 1. Health check ──────────────────────────────────────────────

echo ""
bold "━━━ CryptoTracker Backend Verification ━━━"
echo ""
echo "Target: $BASE"
echo "JWT:    ${TEST_JWT:+set (${#TEST_JWT} chars)}${TEST_JWT:-NOT SET — auth tests will fail}"
echo ""

RESP=$(curl -s -w "\n%{http_code}" "$BASE/api/status" 2>&1 || echo -e "\n000")
BODY=$(echo "$RESP" | head -n -1)
CODE=$(echo "$RESP" | tail -1)
assert "GET /api/status" "200" "$CODE" "$BODY"

# ── 2. Public endpoints ─────────────────────────────────────────

RESP=$(curl -s -w "\n%{http_code}" "$BASE/api/assets" 2>&1 || echo -e "\n000")
BODY=$(echo "$RESP" | head -n -1)
CODE=$(echo "$RESP" | tail -1)
assert "GET /api/assets (public)" "200" "$CODE" "$BODY"

RESP=$(curl -s -w "\n%{http_code}" "$BASE/api/prices" 2>&1 || echo -e "\n000")
BODY=$(echo "$RESP" | head -n -1)
CODE=$(echo "$RESP" | tail -1)
assert "GET /api/prices (null/stale before cron)" "200" "$CODE" "$BODY"
# Show prices response for manual inspection
echo "    Prices response: ${BODY:0:120}"

# ── 3. Auth-required: no token → 401 ────────────────────────────

RESP=$(curl -s -w "\n%{http_code}" "$BASE/api/transactions" 2>&1 || echo -e "\n000")
BODY=$(echo "$RESP" | head -n -1)
CODE=$(echo "$RESP" | tail -1)
assert "GET /api/transactions (no auth → 401)" "401" "$CODE" "$BODY"

# ── 4. Auth-required: with token ─────────────────────────────────

if [[ -z "$TEST_JWT" ]]; then
  echo ""
  echo "$(red "⚠")  Skipping authenticated tests — set TEST_JWT env var"
  echo "   Example: TEST_JWT=\$(pbpaste) bash test-local.sh"
  echo ""
else
  # GET transactions
  RESP=$(curl -s -w "\n%{http_code}" -H "$(auth_header)" "$BASE/api/transactions" 2>&1 || echo -e "\n000")
  BODY=$(echo "$RESP" | head -n -1)
  CODE=$(echo "$RESP" | tail -1)
  assert "GET /api/transactions (authed)" "200" "$CODE" "$BODY"

  # We need a valid asset_id to create a transaction.
  # Grab one from the assets list (first result)
  ASSET_ID=$(curl -s "$BASE/api/assets" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

  if [[ -z "$ASSET_ID" ]]; then
    echo "$(red "⚠")  No assets found in D1 — seed the database first."
    echo "   Run: npx wrangler d1 execute crypto-tracker --local --file=../seed/schema.sql"
  else
    echo "    Using asset_id: $ASSET_ID"

    # POST transaction
    TX_BODY=$(cat <<EOF
{
  "asset_id": "$ASSET_ID",
  "timestamp": "2026-01-15T10:00:00Z",
  "type": "buy",
  "qty": 0.5,
  "unit_price": 42000,
  "fee_amount": 10,
  "source": "test-script"
}
EOF
)
    RESP=$(curl -s -w "\n%{http_code}" -X POST -H "$(auth_header)" -H "Content-Type: application/json" -d "$TX_BODY" "$BASE/api/transactions" 2>&1 || echo -e "\n000")
    BODY=$(echo "$RESP" | head -n -1)
    CODE=$(echo "$RESP" | tail -1)
    assert "POST /api/transactions" "201" "$CODE" "$BODY"

    # Extract transaction ID
    TX_ID=$(echo "$BODY" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

    if [[ -n "$TX_ID" ]]; then
      echo "    Created tx_id: $TX_ID"

      # PUT transaction
      RESP=$(curl -s -w "\n%{http_code}" -X PUT -H "$(auth_header)" -H "Content-Type: application/json" \
        -d '{"note":"updated by test script","qty":0.75}' \
        "$BASE/api/transactions/$TX_ID" 2>&1 || echo -e "\n000")
      BODY=$(echo "$RESP" | head -n -1)
      CODE=$(echo "$RESP" | tail -1)
      assert "PUT /api/transactions/:id" "200" "$CODE" "$BODY"

      # DELETE transaction
      RESP=$(curl -s -w "\n%{http_code}" -X DELETE -H "$(auth_header)" "$BASE/api/transactions/$TX_ID" 2>&1 || echo -e "\n000")
      BODY=$(echo "$RESP" | head -n -1)
      CODE=$(echo "$RESP" | tail -1)
      assert "DELETE /api/transactions/:id" "200" "$CODE" "$BODY"

      # DELETE same transaction again → 404
      RESP=$(curl -s -w "\n%{http_code}" -X DELETE -H "$(auth_header)" "$BASE/api/transactions/$TX_ID" 2>&1 || echo -e "\n000")
      BODY=$(echo "$RESP" | head -n -1)
      CODE=$(echo "$RESP" | tail -1)
      assert "DELETE /api/transactions/:id (already deleted → 404)" "404" "$CODE" "$BODY"
    fi

    # ── 5. Imported files — duplicate detection ──────────────────

    FILE_BODY=$(cat <<EOF
{
  "file_name": "test-export.csv",
  "file_hash": "test-hash-$(date +%s)",
  "exchange": "binance",
  "export_type": "spot",
  "row_count": 42
}
EOF
)
    RESP=$(curl -s -w "\n%{http_code}" -X POST -H "$(auth_header)" -H "Content-Type: application/json" \
      -d "$FILE_BODY" "$BASE/api/imported-files" 2>&1 || echo -e "\n000")
    BODY=$(echo "$RESP" | head -n -1)
    CODE=$(echo "$RESP" | tail -1)
    assert "POST /api/imported-files (first insert)" "201" "$CODE" "$BODY"

    # Same file again → 409
    RESP=$(curl -s -w "\n%{http_code}" -X POST -H "$(auth_header)" -H "Content-Type: application/json" \
      -d "$FILE_BODY" "$BASE/api/imported-files" 2>&1 || echo -e "\n000")
    BODY=$(echo "$RESP" | head -n -1)
    CODE=$(echo "$RESP" | tail -1)
    assert "POST /api/imported-files (duplicate → 409)" "409" "$CODE" "$BODY"
  fi
fi

# ── 6. 404 for unknown routes ────────────────────────────────────

RESP=$(curl -s -w "\n%{http_code}" "$BASE/api/nonexistent" 2>&1 || echo -e "\n000")
BODY=$(echo "$RESP" | head -n -1)
CODE=$(echo "$RESP" | tail -1)
assert "GET /api/nonexistent (→ 404)" "404" "$CODE" "$BODY"

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
