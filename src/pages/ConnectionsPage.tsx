/**
 * ConnectionsPage — Exchange API & Wallet Connections Manager
 * Inspired by Rotki's direct exchange integration + Ghostfolio's data providers
 * Phase 1: UI scaffolding + planned architecture (actual API keys deferred per project policy)
 */
import { useState } from "react";

interface ExchangeConfig {
  id: string;
  name: string;
  icon: string;
  status: "connected" | "disconnected" | "error";
  supportedFeatures: string[];
  color: string;
  docsUrl: string;
}

const EXCHANGES: ExchangeConfig[] = [
  { id: "binance", name: "Binance", icon: "🟡", status: "disconnected", color: "#f0b90b",
    supportedFeatures: ["Spot Trades", "Deposits", "Withdrawals"], docsUrl: "https://binance.com/en/my/settings/api-management" },
  { id: "bybit", name: "Bybit", icon: "🟠", status: "disconnected", color: "#f7a600",
    supportedFeatures: ["Spot Trades", "Deposits"], docsUrl: "https://bybit.com/app/user/api-management" },
  { id: "okx", name: "OKX", icon: "⚪", status: "disconnected", color: "#ffffff",
    supportedFeatures: ["Spot Trades", "Deposits", "Withdrawals"], docsUrl: "https://okx.com/account/my-api" },
  { id: "gate", name: "Gate.io", icon: "🔵", status: "disconnected", color: "#2354e6",
    supportedFeatures: ["Spot Trades"], docsUrl: "https://gate.io/myaccount/apikeys" },
  { id: "coinbase", name: "Coinbase", icon: "🔷", status: "disconnected", color: "#0052ff",
    supportedFeatures: ["Spot Trades", "Deposits", "Withdrawals"], docsUrl: "https://coinbase.com/settings/api" },
  { id: "kraken", name: "Kraken", icon: "🟣", status: "disconnected", color: "#5741d9",
    supportedFeatures: ["Spot Trades", "Deposits", "Withdrawals"], docsUrl: "https://kraken.com/u/settings/api" },
];

interface WalletConfig {
  id: string;
  chain: string;
  address: string;
  label?: string;
  status: "syncing" | "synced" | "error";
}

export default function ConnectionsPage() {
  const [selectedExchange, setSelectedExchange] = useState<string | null>(null);
  const [wallets, setWallets] = useState<WalletConfig[]>([]);
  const [newWalletAddress, setNewWalletAddress] = useState("");
  const [newWalletChain, setNewWalletChain] = useState("ethereum");

  const activeExchange = EXCHANGES.find(e => e.id === selectedExchange);

  return (
    <div style={{ padding: 16, maxWidth: 1000, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--text)", margin: 0 }}>
          Connections
        </h2>
        <p style={{ fontSize: 11, color: "var(--muted)", margin: "4px 0 0" }}>
          Connect exchange APIs and wallet addresses for automatic portfolio sync
        </p>
      </div>

      {/* Status Banner */}
      <div className="card" style={{
        padding: "12px 16px", marginBottom: 16,
        background: "linear-gradient(135deg, var(--brand3), transparent)",
        border: "1px solid var(--brand3)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>🔒</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>Read-Only API Keys</div>
            <div style={{ fontSize: 10, color: "var(--muted)" }}>
              CoinCompass only uses read-only permissions. Your funds are always safe. API keys are encrypted and stored securely.
            </div>
          </div>
        </div>
      </div>

      {/* Exchange Grid */}
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>Exchange APIs</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10, marginBottom: 24 }}>
        {EXCHANGES.map(ex => (
          <div
            key={ex.id}
            className="card"
            onClick={() => setSelectedExchange(ex.id)}
            style={{
              padding: 16, cursor: "pointer",
              border: selectedExchange === ex.id ? "2px solid var(--brand)" : "1px solid var(--line)",
              transition: "all .15s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 24 }}>{ex.icon}</span>
              <div>
                <div style={{ fontWeight: 700, color: "var(--text)", fontSize: 13 }}>{ex.name}</div>
                <div style={{
                  fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                  background: ex.status === "connected" ? "rgba(22,163,74,.15)" : "var(--panel2)",
                  color: ex.status === "connected" ? "var(--good)" : "var(--muted)",
                  display: "inline-block", textTransform: "uppercase",
                }}>
                  {ex.status}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
              {ex.supportedFeatures.map(f => (
                <span key={f} style={{
                  fontSize: 9, padding: "1px 5px", borderRadius: 3,
                  background: "var(--panel2)", color: "var(--muted)",
                }}>
                  {f}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Exchange detail panel */}
      {activeExchange && (
        <div className="card" style={{ padding: 20, marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>
                {activeExchange.icon} Connect {activeExchange.name}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                Enter your read-only API credentials below
              </div>
            </div>
            <button
              className="btn secondary"
              style={{ fontSize: 10 }}
              onClick={() => setSelectedExchange(null)}
            >
              ✕ Close
            </button>
          </div>

          <div style={{ display: "grid", gap: 12, maxWidth: 400 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>API Key</label>
              <input
                type="text"
                placeholder="Enter your API key…"
                style={{
                  width: "100%", padding: "8px 10px", fontSize: 12,
                  background: "var(--input-bg)", border: "1px solid var(--line)",
                  borderRadius: 6, color: "var(--text)",
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>API Secret</label>
              <input
                type="password"
                placeholder="Enter your API secret…"
                style={{
                  width: "100%", padding: "8px 10px", fontSize: 12,
                  background: "var(--input-bg)", border: "1px solid var(--line)",
                  borderRadius: 6, color: "var(--text)",
                }}
              />
            </div>
            {activeExchange.id === "okx" && (
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>Passphrase</label>
                <input
                  type="password"
                  placeholder="OKX API passphrase…"
                  style={{
                    width: "100%", padding: "8px 10px", fontSize: 12,
                    background: "var(--input-bg)", border: "1px solid var(--line)",
                    borderRadius: 6, color: "var(--text)",
                  }}
                />
              </div>
            )}
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn" style={{ fontSize: 11, padding: "6px 16px", background: "var(--brand)", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", opacity: 0.5 }} disabled>
              🔗 Connect (Coming Soon)
            </button>
            <a
              href={activeExchange.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 10, color: "var(--brand)", textDecoration: "underline" }}
            >
              How to create an API key →
            </a>
          </div>
          
          <div style={{ marginTop: 12, padding: 10, background: "var(--panel2)", borderRadius: 6, fontSize: 10, color: "var(--muted)" }}>
            ⚠️ <strong>Important:</strong> Only enable <em>Read-Only</em> permissions when creating your API key. Never enable withdrawal permissions.
          </div>
        </div>
      )}

      {/* Wallet Tracking */}
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>Wallet Tracking</div>
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr auto", gap: 8, alignItems: "end" }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>Chain</label>
            <select
              value={newWalletChain}
              onChange={e => setNewWalletChain(e.target.value)}
              style={{
                width: "100%", padding: "7px 8px", fontSize: 11,
                background: "var(--input-bg)", border: "1px solid var(--line)",
                borderRadius: 6, color: "var(--text)",
              }}
            >
              <option value="ethereum">Ethereum</option>
              <option value="bitcoin">Bitcoin</option>
              <option value="solana">Solana</option>
              <option value="polygon">Polygon</option>
              <option value="arbitrum">Arbitrum</option>
              <option value="base">Base</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 4 }}>Wallet Address</label>
            <input
              type="text"
              placeholder="0x… or bc1… or So1…"
              value={newWalletAddress}
              onChange={e => setNewWalletAddress(e.target.value)}
              style={{
                width: "100%", padding: "7px 10px", fontSize: 11,
                background: "var(--input-bg)", border: "1px solid var(--line)",
                borderRadius: 6, color: "var(--text)", fontFamily: "var(--lt-font-mono, monospace)",
              }}
            />
          </div>
          <button
            className="btn"
            disabled
            style={{
              fontSize: 10, padding: "7px 14px",
              background: "var(--brand)", color: "#fff", border: "none",
              borderRadius: 6, opacity: 0.5, cursor: "not-allowed",
            }}
          >
            Track (Coming Soon)
          </button>
        </div>

        {wallets.length === 0 && (
          <div style={{ textAlign: "center", padding: "24px 0", color: "var(--muted)", fontSize: 11 }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>👛</div>
            No wallets tracked yet. Add an address above to monitor on-chain balances.
          </div>
        )}
      </div>

      {/* Sync Status */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>Sync History</div>
        <div style={{ textAlign: "center", padding: 20, color: "var(--muted)", fontSize: 11 }}>
          <div style={{ fontSize: 24, marginBottom: 4 }}>⏳</div>
          No sync activity yet. Connect an exchange or wallet to begin automatic syncing.
        </div>
      </div>
    </div>
  );
}
