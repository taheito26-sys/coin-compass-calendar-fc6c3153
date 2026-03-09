/**
 * Per-Asset Risk Breakdown — shows volatility, concentration, and risk metrics per asset
 */
import { useMemo } from "react";
import { useUnifiedPortfolio } from "@/hooks/useUnifiedPortfolio";
import { useLivePrices } from "@/hooks/useLivePrices";
import { fmtTotal } from "@/lib/cryptoState";

interface AssetRisk {
  sym: string;
  mv: number;
  weight: number;
  volatility: number;
  riskScore: "Low" | "Medium" | "High";
  concentration: "Diversified" | "Moderate" | "Concentrated";
}

const RISK_COLORS = {
  Low: "var(--good)",
  Medium: "var(--warn)",
  High: "var(--bad)",
};

const CONC_COLORS = {
  Diversified: "var(--good)",
  Moderate: "var(--warn)",
  Concentrated: "var(--bad)",
};

// Simulated volatility based on asset type (in production, use historical price data)
function estimateVolatility(sym: string): number {
  const stables = ["USDT", "USDC", "DAI", "BUSD", "TUSD", "USDP"];
  const largeCaps = ["BTC", "ETH"];
  const midCaps = ["BNB", "XRP", "ADA", "SOL", "DOT", "AVAX", "MATIC", "LINK"];
  
  if (stables.includes(sym.toUpperCase())) return 0.02;
  if (largeCaps.includes(sym.toUpperCase())) return 0.45;
  if (midCaps.includes(sym.toUpperCase())) return 0.65;
  return 0.85; // Small caps / altcoins
}

function getRiskScore(vol: number, weight: number): "Low" | "Medium" | "High" {
  const combinedRisk = vol * 0.6 + weight * 0.4;
  if (combinedRisk < 0.25) return "Low";
  if (combinedRisk < 0.5) return "Medium";
  return "High";
}

function getConcentration(weight: number): "Diversified" | "Moderate" | "Concentrated" {
  if (weight < 0.15) return "Diversified";
  if (weight < 0.35) return "Moderate";
  return "Concentrated";
}

export default function PerAssetRiskBreakdown() {
  const { positions, totalMV } = useUnifiedPortfolio();
  const { getPrice } = useLivePrices();

  const assetRisks = useMemo((): AssetRisk[] => {
    if (totalMV <= 0 || positions.length === 0) return [];

    return positions
      .map(p => {
        const live = getPrice(p.sym);
        const price = live?.current_price ?? p.price ?? 0;
        const mv = price * p.qty;
        const weight = mv / totalMV;
        const volatility = estimateVolatility(p.sym);
        
        return {
          sym: p.sym,
          mv,
          weight,
          volatility,
          riskScore: getRiskScore(volatility, weight),
          concentration: getConcentration(weight),
        };
      })
      .filter(r => r.mv > 0)
      .sort((a, b) => b.mv - a.mv)
      .slice(0, 10);
  }, [positions, totalMV, getPrice]);

  const portfolioRisk = useMemo(() => {
    if (assetRisks.length === 0) return { avgVol: 0, hhi: 0, riskLevel: "Low" as const };
    
    // Weighted average volatility
    const avgVol = assetRisks.reduce((sum, r) => sum + r.volatility * r.weight, 0);
    
    // Herfindahl-Hirschman Index for concentration
    const hhi = assetRisks.reduce((sum, r) => sum + r.weight * r.weight, 0);
    
    let riskLevel: "Low" | "Medium" | "High" = "Low";
    if (avgVol > 0.5 || hhi > 0.25) riskLevel = "Medium";
    if (avgVol > 0.7 || hhi > 0.5) riskLevel = "High";
    
    return { avgVol, hhi, riskLevel };
  }, [assetRisks]);

  if (assetRisks.length === 0) return null;

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Per-Asset Risk Breakdown</h2>
        <span 
          className="pill" 
          style={{ 
            background: RISK_COLORS[portfolioRisk.riskLevel], 
            color: "#fff",
            fontWeight: 700,
          }}
        >
          {portfolioRisk.riskLevel} Risk
        </span>
      </div>
      <div className="panel-body" style={{ padding: 0 }}>
        {/* Summary metrics */}
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(3, 1fr)", 
          gap: 1, 
          background: "var(--line)",
          borderBottom: "1px solid var(--line)",
        }}>
          <div style={{ background: "var(--card)", padding: "12px", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600, marginBottom: 4 }}>AVG VOLATILITY</div>
            <div style={{ fontSize: 16, fontWeight: 900 }}>{(portfolioRisk.avgVol * 100).toFixed(1)}%</div>
          </div>
          <div style={{ background: "var(--card)", padding: "12px", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600, marginBottom: 4 }}>CONCENTRATION (HHI)</div>
            <div style={{ fontSize: 16, fontWeight: 900 }}>{(portfolioRisk.hhi * 100).toFixed(1)}%</div>
          </div>
          <div style={{ background: "var(--card)", padding: "12px", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600, marginBottom: 4 }}>ASSETS</div>
            <div style={{ fontSize: 16, fontWeight: 900 }}>{assetRisks.length}</div>
          </div>
        </div>

        {/* Asset table */}
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Asset</th>
                <th style={{ textAlign: "right" }}>Weight</th>
                <th style={{ textAlign: "right" }}>Volatility</th>
                <th style={{ textAlign: "center" }}>Risk</th>
                <th style={{ textAlign: "center" }}>Concentration</th>
              </tr>
            </thead>
            <tbody>
              {assetRisks.map(r => (
                <tr key={r.sym}>
                  <td className="mono" style={{ fontWeight: 900 }}>{r.sym}</td>
                  <td className="mono" style={{ textAlign: "right" }}>
                    {(r.weight * 100).toFixed(1)}%
                  </td>
                  <td className="mono" style={{ textAlign: "right" }}>
                    {(r.volatility * 100).toFixed(0)}%
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span 
                      className="pill" 
                      style={{ 
                        fontSize: 9,
                        background: RISK_COLORS[r.riskScore],
                        color: "#fff",
                        fontWeight: 700,
                      }}
                    >
                      {r.riskScore}
                    </span>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span 
                      className="pill" 
                      style={{ 
                        fontSize: 9,
                        background: CONC_COLORS[r.concentration],
                        color: "#fff",
                        fontWeight: 700,
                      }}
                    >
                      {r.concentration}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
