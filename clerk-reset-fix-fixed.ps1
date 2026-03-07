param(
    [string]$RepoPath = "D:\OneDrive\Documents\GitHub\coin-compass-calendar-fc6c3153",
    [string]$BranchName = "clerk-auth-clean",
    [string]$PublishableKey = "pk_test_ZmFuY3ktc3VuYmVhbS0zNy5jbGVyay5hY2NvdW50cy5kZXYk",
    [string]$WorkerApiUrl = "https://cryptotracker-api.taheito26.workers.dev",
    [string]$ClerkJwksUrl = "https://fancy-sunbeam-37.clerk.accounts.dev/.well-known/jwks.json",
    [string]$AllowedOrigins = "http://localhost:8080,http://localhost:8081,http://localhost:5173,https://cryptotracker-api.taheito26.workers.dev",
    [switch]$SkipCommit
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "=== $Message ===" -ForegroundColor Cyan
}

function Write-Utf8NoBom {
    param(
        [string]$Path,
        [string]$Content
    )
    $fullPath = Join-Path $RepoPath $Path
    $dir = Split-Path $fullPath -Parent
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($fullPath, $Content, $utf8NoBom)
}

function Ensure-IgnoreLine {
    param([string]$Line)
    $gitignorePath = Join-Path $RepoPath ".gitignore"
    $content = ""
    if (Test-Path $gitignorePath) {
        $content = Get-Content $gitignorePath -Raw
    }
    if ($content -notmatch [regex]::Escape($Line)) {
        if ($content.Length -gt 0 -and -not $content.EndsWith("`r`n")) {
            $content += "`r`n"
        }
        $content += $Line + "`r`n"
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($gitignorePath, $content, $utf8NoBom)
    }
}

function Move-GoogleImport-ToTop {
    $path = Join-Path $RepoPath "src\index.css"
    if (-not (Test-Path $path)) {
        return
    }

    $importLine = "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;700&family=Space+Grotesk:wght@400;500;600;700&family=Sora:wght@400;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=DM+Sans:wght@400;500;600;700&family=Outfit:wght@400;500;600;700&family=Fira+Code:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500;700&family=Roboto:wght@400;500;700&display=swap');"
    $content = Get-Content $path -Raw

    $content = $content.Replace($importLine, "")
    $content = $importLine + "`r`n`r`n" + $content.TrimStart()

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
}

function Patch-TypesFile {
    $typesPath = Join-Path $RepoPath "backend\src\types.ts"
    if (-not (Test-Path $typesPath)) {
        return
    }

    $content = Get-Content $typesPath -Raw

    if ($content -notmatch "CLERK_JWKS_URL") {
        $content = $content -replace "export interface Env \{", "export interface Env {`r`n  CLERK_JWKS_URL: string;`r`n  ALLOWED_ORIGINS?: string;"
    }

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($typesPath, $content, $utf8NoBom)
}

if (-not (Test-Path $RepoPath)) {
    throw "RepoPath not found: $RepoPath"
}

Push-Location $RepoPath
try {
    Write-Step "Abort any in-progress rebase"
    try {
        & git rebase --abort 2>$null | Out-Null
    } catch {}

    Write-Step "Create backup branch from current state"
    $backupBranch = "backup-before-clerk-fix-" + (Get-Date -Format "yyyyMMdd-HHmmss")
    & git branch $backupBranch | Out-Null

    Write-Step "Reset main to origin and create clean work branch"
    & git fetch origin | Out-Host
    & git switch main | Out-Host
    & git reset --hard origin/main | Out-Host
    & git switch -C $BranchName origin/main | Out-Host

    Write-Step "Ignore local-only files"
    Ensure-IgnoreLine ".env.local"
    Ensure-IgnoreLine "backend/.dev.vars"
    Ensure-IgnoreLine "backend/.wrangler/"
    Ensure-IgnoreLine "_auth_patch_backup_*/"

    if (Test-Path ".\backend\.wrangler") {
        Remove-Item -Recurse -Force ".\backend\.wrangler" -ErrorAction SilentlyContinue
    }
    & git rm -r --cached --ignore-unmatch backend/.wrangler | Out-Null

    Write-Step "Write clean Clerk frontend files"
    Write-Utf8NoBom -Path "src\main.tsx" -Content @'
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import App from "./App";
import "./index.css";

const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function MissingClerkConfig() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--bg, #0a0a0a)",
        color: "var(--text, #ffffff)",
        padding: 24,
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          width: "min(640px, 100%)",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 20,
          padding: 24,
          boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>CoinCompass</div>
        <div style={{ color: "var(--muted, #a1a1aa)", marginBottom: 18 }}>
          Authentication is required for the cloud-backed app.
        </div>
        <div style={{ lineHeight: 1.6, color: "var(--muted2, #d4d4d8)" }}>
          Missing <code>VITE_CLERK_PUBLISHABLE_KEY</code> in your frontend environment.
          Add it to <code>.env.local</code>, then restart Vite.
        </div>
      </div>
    </div>
  );
}

if (!clerkKey) {
  createRoot(document.getElementById("root")!).render(<MissingClerkConfig />);
} else {
  createRoot(document.getElementById("root")!).render(
    <ClerkProvider publishableKey={clerkKey}>
      <App />
    </ClerkProvider>,
  );
}
'@

    Write-Utf8NoBom -Path "src\App.tsx" -Content @'
import { useState } from "react";
import { SignIn, UserButton, useAuth, useUser } from "@clerk/react";
import { CryptoProvider, useCrypto } from "@/lib/cryptoContext";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import DashboardPage from "@/pages/DashboardPage";
import PortfolioPage from "@/pages/PortfolioPage";
import LedgerPage from "@/pages/LedgerPage";
import CalendarPage from "@/pages/CalendarPage";
import MarketsPage from "@/pages/MarketsPage";
import SettingsPage from "@/pages/SettingsPage";
import VaultPage from "@/pages/VaultPage";

const PAGE_TITLES: Record<string, [string, string]> = {
  dashboard: ["Dashboard", "KPIs, Allocation, Heatmap"],
  assets: ["Assets", "Positions, P&L, Lots"],
  calendar: ["Calendar", "Daily P&L, Per Coin"],
  ledger: ["Ledger", "Journal, Import, Manual Entry"],
  markets: ["Live Markets", "Bubbles, Prices, Watchlist"],
  vault: ["Vault", "Snapshots, Backups, Export"],
  settings: ["Settings", "Layout, Themes, Data"],
};

function LoadingScreen() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--bg, #0a0a0a)",
        color: "var(--muted, #a1a1aa)",
      }}
    >
      Loading authentication...
    </div>
  );
}

function SignInScreen() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background:
          "radial-gradient(circle at top, rgba(59,130,246,0.15), transparent 30%), var(--bg, #0a0a0a)",
      }}
    >
      <div
        style={{
          width: "min(980px, 100%)",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 24,
          alignItems: "center",
        }}
      >
        <div style={{ color: "var(--text, #ffffff)" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 10px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.06)",
              color: "var(--muted, #cbd5e1)",
              fontSize: 12,
              marginBottom: 16,
            }}
          >
            CoinCompass login
          </div>
          <h1 style={{ fontSize: 40, lineHeight: 1.1, margin: "0 0 12px" }}>
            Sign in once, keep the portfolio synced everywhere.
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.7, color: "var(--muted, #a1a1aa)", margin: 0 }}>
            Use email and password for the simplest path. If Google or Microsoft login is enabled in
            Clerk, those buttons will appear automatically.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 24,
            padding: 20,
            boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
          }}
        >
          <SignIn routing="hash" />
        </div>
      </div>
    </div>
  );
}

function AppShell({
  onLogout,
  userLabel,
}: {
  onLogout: () => Promise<void>;
  userLabel?: string;
}) {
  const [page, setPage] = useState("dashboard");
  const { toastMsg } = useCrypto();
  const [title, sub] = PAGE_TITLES[page] || ["CryptoTracker", ""];

  return (
    <>
      <div className="app">
        <Sidebar page={page} onNav={setPage} onLogout={onLogout} />
        <div className="mainWrap">
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 10,
              padding: "12px 18px 0",
            }}
          >
            {userLabel ? (
              <span style={{ fontSize: 12, color: "var(--muted, #a1a1aa)" }}>{userLabel}</span>
            ) : null}
            <UserButton afterSignOutUrl="/" />
          </div>

          <Topbar title={title} sub={sub} onNav={setPage} />

          <div className="scroll">
            {page === "dashboard" && <DashboardPage />}
            {page === "assets" && <PortfolioPage />}
            {page === "calendar" && <CalendarPage />}
            {page === "ledger" && <LedgerPage />}
            {page === "markets" && <MarketsPage />}
            {page === "vault" && <VaultPage />}
            {page === "settings" && <SettingsPage />}
          </div>
        </div>
      </div>

      {toastMsg ? <div className={`toast show ${toastMsg.type}`}>{toastMsg.msg}</div> : null}
    </>
  );
}

function ClerkRoot() {
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const { user } = useUser();

  if (!isLoaded) {
    return <LoadingScreen />;
  }

  if (!isSignedIn) {
    return <SignInScreen />;
  }

  const userLabel =
    user?.primaryEmailAddress?.emailAddress || user?.username || user?.fullName || "Signed in";

  return <AppShell onLogout={() => signOut()} userLabel={userLabel} />;
}

export default function App() {
  return (
    <CryptoProvider>
      <ClerkRoot />
    </CryptoProvider>
  );
}
'@

    Write-Utf8NoBom -Path "src\hooks\usePortfolio.ts" -Content @'
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/react";
import {
  fetchAssets,
  fetchPrices,
  fetchTransactions,
  isWorkerAvailable,
  setAuthTokenProvider,
  type ApiAsset,
  type ApiPriceEntry,
  type ApiTransaction,
} from "@/lib/api";

export interface Position {
  assetId: string;
  symbol: string;
  name: string;
  category: string;
  qty: number;
  cost: number;
  avg: number;
  price: number | null;
  priceChange1h: number | null;
  priceChange24h: number | null;
  priceChange7d: number | null;
  marketCap: number | null;
  volume24h: number | null;
  mv: number | null;
  pnlAbs: number | null;
  pnlPct: number | null;
}

export interface PortfolioData {
  positions: Position[];
  totalMV: number;
  totalCost: number;
  totalPnl: number;
  totalPnlPct: number;
  assetCount: number;
  txCount: number;
  priceAge: string;
  loading: boolean;
  error: string | null;
  authenticated: boolean;
  workerOnline: boolean;
  refresh: () => Promise<void>;
}

function buildPositions(
  assets: ApiAsset[],
  txs: ApiTransaction[],
  prices: Record<string, ApiPriceEntry>,
): Position[] {
  const assetMap = new Map<string, ApiAsset>();
  for (const asset of assets) assetMap.set(asset.id, asset);

  const positionMap = new Map<string, { qty: number; cost: number }>();

  for (const tx of txs) {
    const current = positionMap.get(tx.asset_id) || { qty: 0, cost: 0 };
    const txTotal = tx.qty * tx.unit_price;

    switch (tx.type) {
      case "buy":
      case "transfer_in":
      case "reward":
        current.qty += tx.qty;
        current.cost += txTotal + tx.fee_amount;
        break;
      case "sell":
      case "transfer_out":
        if (current.qty > 0) {
          const avgCost = current.cost / current.qty;
          const soldQty = Math.min(tx.qty, current.qty);
          current.qty -= soldQty;
          current.cost -= avgCost * soldQty;
        }
        break;
      case "fee":
        current.cost += tx.fee_amount;
        break;
      default:
        break;
    }

    if (current.qty < 0.00000001) {
      current.qty = 0;
      current.cost = 0;
    }

    positionMap.set(tx.asset_id, current);
  }

  const result: Position[] = [];

  for (const [assetId, position] of positionMap) {
    if (position.qty <= 0) continue;

    const asset = assetMap.get(assetId);
    if (!asset) continue;

    const priceData = prices[assetId];
    const price = priceData?.price ?? null;
    const mv = price !== null ? price * position.qty : null;
    const pnlAbs = mv !== null ? mv - position.cost : null;
    const pnlPct = position.cost > 0 && pnlAbs !== null ? (pnlAbs / position.cost) * 100 : null;

    result.push({
      assetId,
      symbol: asset.symbol,
      name: asset.name,
      category: asset.category || "other",
      qty: position.qty,
      cost: position.cost,
      avg: position.qty > 0 ? position.cost / position.qty : 0,
      price,
      priceChange1h: priceData?.change_1h ?? null,
      priceChange24h: priceData?.change_24h ?? null,
      priceChange7d: priceData?.change_7d ?? null,
      marketCap: priceData?.market_cap ?? null,
      volume24h: priceData?.volume_24h ?? null,
      mv,
      pnlAbs,
      pnlPct,
    });
  }

  result.sort((a, b) => (b.mv ?? 0) - (a.mv ?? 0));
  return result;
}

const PRICE_POLL_MS = 120000;

export function usePortfolio(): PortfolioData {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [positions, setPositions] = useState<Position[]>([]);
  const [txCount, setTxCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [priceTs, setPriceTs] = useState(0);
  const [workerOnline, setWorkerOnline] = useState(false);

  const assetsRef = useRef<ApiAsset[]>([]);
  const txsRef = useRef<ApiTransaction[]>([]);

  useEffect(() => {
    setAuthTokenProvider(async () => {
      if (!isSignedIn) return null;
      return getToken();
    });
  }, [getToken, isSignedIn]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (!isSignedIn) {
        assetsRef.current = [];
        txsRef.current = [];
        setPositions([]);
        setTxCount(0);
        setPriceTs(0);
        setWorkerOnline(false);
        setLoading(false);
        return;
      }

      const [assets, txs, priceData, online] = await Promise.all([
        fetchAssets(),
        fetchTransactions(),
        fetchPrices(),
        isWorkerAvailable(),
      ]);

      assetsRef.current = assets;
      txsRef.current = txs;
      setWorkerOnline(online);
      setTxCount(txs.length);
      setPriceTs(priceData.ts);
      setPositions(buildPositions(assets, txs, priceData.prices));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load portfolio";
      console.error("Portfolio load error:", err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [isSignedIn]);

  const refreshPrices = useCallback(async () => {
    if (!isSignedIn || assetsRef.current.length === 0) {
      return;
    }

    try {
      const priceData = await fetchPrices();
      setPriceTs(priceData.ts);
      setPositions(buildPositions(assetsRef.current, txsRef.current, priceData.prices));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Price refresh failed";
      console.warn("Price refresh failed:", message);
    }
  }, [isSignedIn]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!isSignedIn) return undefined;

    const timer = window.setInterval(() => {
      void refreshPrices();
    }, PRICE_POLL_MS);

    return () => clearInterval(timer);
  }, [isSignedIn, refreshPrices]);

  const derived = useMemo(() => {
    const totalMV = positions.reduce((sum, position) => sum + (position.mv ?? 0), 0);
    const totalCost = positions.reduce((sum, position) => sum + position.cost, 0);
    const totalPnl = totalMV - totalCost;
    const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

    let priceAge = "-";
    if (priceTs > 0) {
      const ageMs = Date.now() - priceTs;
      priceAge = ageMs < 60000 ? `${Math.round(ageMs / 1000)}s` : `${Math.round(ageMs / 60000)}m`;
    }

    return { totalMV, totalCost, totalPnl, totalPnlPct, priceAge };
  }, [positions, priceTs]);

  return {
    positions,
    ...derived,
    assetCount: positions.length,
    txCount,
    priceAge: derived.priceAge,
    loading: !isLoaded || loading,
    error,
    authenticated: Boolean(isSignedIn),
    workerOnline,
    refresh: loadData,
  };
}
'@

    Write-Step "Write clean Clerk backend auth middleware"
    Write-Utf8NoBom -Path "backend\src\middleware\auth.ts" -Content @'
import { Context, Next } from "hono";
import type { Env } from "../types";

let jwksCache: Map<string, CryptoKey> = new Map();
let jwksCacheTs = 0;
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;

export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const jwksUrl = c.env.CLERK_JWKS_URL;
  if (!jwksUrl) {
    console.error("CLERK_JWKS_URL is missing");
    return c.json({ error: "Server misconfiguration: missing Clerk JWKS URL" }, 500);
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifyRs256(token, jwksUrl);
    const now = Date.now() / 1000;
    const userId = payload.sub;

    if (!userId || typeof userId !== "string") {
      return c.json({ error: "Invalid token: missing sub" }, 401);
    }

    if (typeof payload.exp === "number" && payload.exp < now) {
      return c.json({ error: "Token expired" }, 401);
    }

    if (typeof payload.nbf === "number" && payload.nbf > now) {
      return c.json({ error: "Token not active yet" }, 401);
    }

    c.set("userId", userId);
    await next();
  } catch (error) {
    console.error("JWT verification failed:", error);
    return c.json({ error: "Invalid token" }, 401);
  }
}

async function verifyRs256(
  token: string,
  jwksUrl: string,
): Promise<Record<string, string | number | boolean | null | undefined>> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = JSON.parse(base64UrlDecode(headerB64)) as { alg?: string; kid?: string };

  if (header.alg !== "RS256") {
    throw new Error(`Unsupported algorithm: ${header.alg ?? "unknown"}`);
  }

  if (!header.kid) {
    throw new Error("JWT missing kid in header");
  }

  const key = await getJwksKey(jwksUrl, header.kid);
  if (!key) {
    throw new Error(`No matching key found for kid: ${header.kid}`);
  }

  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlToBuffer(signatureB64);

  const valid = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    key,
    signature,
    data,
  );

  if (!valid) {
    throw new Error("Invalid signature");
  }

  return JSON.parse(base64UrlDecode(payloadB64));
}

async function getJwksKey(jwksUrl: string, kid: string): Promise<CryptoKey | null> {
  if (jwksCache.has(kid) && Date.now() - jwksCacheTs < JWKS_CACHE_TTL_MS) {
    return jwksCache.get(kid) ?? null;
  }

  const response = await fetch(jwksUrl, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS: ${response.status}`);
  }

  const jwks = (await response.json()) as { keys?: JsonWebKey[] };

  jwksCache = new Map();
  jwksCacheTs = Date.now();

  for (const jwk of jwks.keys ?? []) {
    if (jwk.kty !== "RSA" || !jwk.kid) continue;

    try {
      const key = await crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
      jwksCache.set(jwk.kid, key);
    } catch (error) {
      console.warn(`Failed to import JWK kid=${jwk.kid}:`, error);
    }
  }

  return jwksCache.get(kid) ?? null;
}

function normalizeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4;
  return pad === 0 ? normalized : `${normalized}${"=".repeat(4 - pad)}`;
}

function base64UrlDecode(input: string): string {
  return atob(normalizeBase64Url(input));
}

function base64UrlToBuffer(input: string): ArrayBuffer {
  const binary = atob(normalizeBase64Url(input));
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}
'@

    Patch-TypesFile

    Write-Step "Write clean wrangler config and env example"
    Write-Utf8NoBom -Path "backend\wrangler.toml" -Content @'
name = "cryptotracker-api"
main = "src/index.ts"
compatibility_date = "2025-03-01"
compatibility_flags = ["nodejs_compat"]

[triggers]
crons = ["*/2 * * * *"]

[[d1_databases]]
binding = "DB"
database_name = "crypto-tracker"
database_id = "e51dd932-5912-4a1b-b354-ff03bc25d23e"

[[kv_namespaces]]
binding = "PRICE_KV"
id = "5a8b838fa6fc43578654af2d14674439"
'@

    Write-Utf8NoBom -Path ".env.example" -Content @'
VITE_CLERK_PUBLISHABLE_KEY=pk_test_REPLACE_ME
VITE_WORKER_API_URL=https://your-worker-name.your-subdomain.workers.dev
'@

    Write-Step "Patch dashboard copy and CSS import order"
    $dashboardPath = Join-Path $RepoPath "src\pages\DashboardPage.tsx"
    if (Test-Path $dashboardPath) {
        $dashboard = Get-Content $dashboardPath -Raw
        $dashboard = $dashboard.Replace(
            "Not logged in — showing local data only. Sign in to see your Supabase portfolio.",
            "Not signed in — showing local data only. Sign in to sync your portfolio."
        )
        $dashboard = $dashboard.Replace(
            "Not logged in - showing local data only. Sign in to see your Supabase portfolio.",
            "Not signed in - showing local data only. Sign in to sync your portfolio."
        )
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($dashboardPath, $dashboard, $utf8NoBom)
    }

    Move-GoogleImport-ToTop

    Write-Step "Write local env files"
    Write-Utf8NoBom -Path ".env.local" -Content @"
VITE_CLERK_PUBLISHABLE_KEY=$PublishableKey
VITE_WORKER_API_URL=$WorkerApiUrl
"@

    Write-Utf8NoBom -Path "backend\.dev.vars" -Content @"
CLERK_JWKS_URL=$ClerkJwksUrl
ALLOWED_ORIGINS=$AllowedOrigins
"@

    Write-Step "Replace old Clerk package and install dependencies"
    & npm uninstall @clerk/clerk-react | Out-Host
    & npm install @clerk/react | Out-Host
    & npm install | Out-Host

    Write-Step "Build frontend"
    & npm run build | Out-Host

    if (-not $SkipCommit) {
        Write-Step "Commit clean Clerk fix branch"
        & git add .gitignore .env.example backend/src backend/wrangler.toml package.json package-lock.json src .env.local | Out-Null
        & git reset .env.local | Out-Null
        & git commit -m "Restore clean Clerk auth flow and Worker config" | Out-Host
    }

    Write-Step "Done"
    Write-Host "Branch: $BranchName" -ForegroundColor Green
    Write-Host "Backup branch: $backupBranch" -ForegroundColor Green
    Write-Host "Run npm run dev from the repo root." -ForegroundColor Green
}
finally {
    Pop-Location
}