import { useState, useEffect, useRef, useCallback } from "react";
import { useCrypto } from "@/lib/cryptoContext";

interface CoinData {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  total_volume: number;
  price_change_percentage_1h_in_currency: number;
  price_change_percentage_24h_in_currency: number;
  price_change_percentage_7d_in_currency: number;
  market_cap_rank: number;
}

interface Bubble {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change: number;
  marketCap: number;
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
}

const TIME_RANGES = [
  { key: "1h", label: "Hour" },
  { key: "24h", label: "Day" },
  { key: "7d", label: "Week" },
];

function formatCompact(n: number): string {
  if (n >= 1e12) return "$" + (n / 1e12).toFixed(1) + "T";
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(0) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(0) + "M";
  return "$" + n.toLocaleString();
}

export default function MarketsPage() {
  const { state, setState, toast } = useCrypto();
  const [coins, setCoins] = useState<CoinData[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"bubbles" | "table">("bubbles");
  const [timeRange, setTimeRange] = useState("24h");
  const [coinCount, setCoinCount] = useState(100);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bubblesRef = useRef<Bubble[]>([]);
  const animRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch coin data from CoinGecko
  useEffect(() => {
    let cancelled = false;
    const fetchCoins = async () => {
      setLoading(true);
      try {
        const r = await fetch(
          `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${coinCount}&page=1&sparkline=false&price_change_percentage=1h,24h,7d`,
          { signal: AbortSignal.timeout(15000) }
        );
        if (!r.ok) throw new Error("API " + r.status);
        const data = await r.json();
        if (!cancelled) setCoins(data);
      } catch (e) {
        console.error("Failed to fetch market data:", e);
      }
      if (!cancelled) setLoading(false);
    };
    fetchCoins();
    return () => { cancelled = true; };
  }, [coinCount]);

  // Get change % based on timeRange
  const getChange = useCallback((coin: CoinData) => {
    switch (timeRange) {
      case "1h": return coin.price_change_percentage_1h_in_currency || 0;
      case "7d": return coin.price_change_percentage_7d_in_currency || 0;
      default: return coin.price_change_percentage_24h_in_currency || 0;
    }
  }, [timeRange]);

  // Initialize bubbles
  useEffect(() => {
    if (coins.length === 0 || view !== "bubbles") return;
    const container = containerRef.current;
    if (!container) return;

    const W = container.clientWidth;
    const H = container.clientHeight || 500;

    const maxMcap = Math.max(...coins.map(c => c.market_cap || 1));
    
    bubblesRef.current = coins.map((coin, i) => {
      const change = getChange(coin);
      const mcapRatio = Math.sqrt((coin.market_cap || 1) / maxMcap);
      const r = Math.max(16, Math.min(60, mcapRatio * 60));
      return {
        id: coin.id,
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        price: coin.current_price,
        change,
        marketCap: coin.market_cap,
        x: Math.random() * (W - r * 2) + r,
        y: Math.random() * (H - r * 2) + r,
        r,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
      };
    });

    // Simple physics simulation
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const animate = () => {
      const bubbles = bubblesRef.current;
      ctx.clearRect(0, 0, W, H);

      // Update positions with simple collision
      for (const b of bubbles) {
        b.x += b.vx;
        b.y += b.vy;

        // Wall bounce
        if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.8; }
        if (b.x + b.r > W) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * 0.8; }
        if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.8; }
        if (b.y + b.r > H) { b.y = H - b.r; b.vy = -Math.abs(b.vy) * 0.8; }

        // Damping
        b.vx *= 0.998;
        b.vy *= 0.998;
      }

      // Basic bubble-bubble collision
      for (let i = 0; i < bubbles.length; i++) {
        for (let j = i + 1; j < bubbles.length; j++) {
          const a = bubbles[i], b = bubbles[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = a.r + b.r;
          if (dist < minDist && dist > 0) {
            const overlap = (minDist - dist) / 2;
            const nx = dx / dist, ny = dy / dist;
            a.x -= nx * overlap * 0.5;
            a.y -= ny * overlap * 0.5;
            b.x += nx * overlap * 0.5;
            b.y += ny * overlap * 0.5;
            // Transfer velocity
            const dvx = a.vx - b.vx, dvy = a.vy - b.vy;
            const dvn = dvx * nx + dvy * ny;
            if (dvn > 0) {
              a.vx -= dvn * nx * 0.3;
              a.vy -= dvn * ny * 0.3;
              b.vx += dvn * nx * 0.3;
              b.vy += dvn * ny * 0.3;
            }
          }
        }
      }

      // Draw bubbles
      for (const b of bubbles) {
        const isPos = b.change >= 0;
        const intensity = Math.min(Math.abs(b.change) / 15, 1);
        
        // Bubble fill
        const alpha = 0.15 + intensity * 0.35;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = isPos
          ? `rgba(22, 163, 74, ${alpha})`
          : `rgba(220, 38, 38, ${alpha})`;
        ctx.fill();

        // Bubble border
        ctx.strokeStyle = isPos
          ? `rgba(22, 163, 74, ${0.3 + intensity * 0.5})`
          : `rgba(220, 38, 38, ${0.3 + intensity * 0.5})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Text
        ctx.textAlign = "center";
        ctx.fillStyle = isPos ? "#4ade80" : "#f87171";

        if (b.r > 25) {
          ctx.font = `bold ${Math.max(9, b.r * 0.32)}px Inter, sans-serif`;
          ctx.fillText(b.symbol, b.x, b.y - 2);
          ctx.font = `${Math.max(8, b.r * 0.22)}px Inter, sans-serif`;
          ctx.fillStyle = "rgba(255,255,255,0.7)";
          ctx.fillText((b.change >= 0 ? "+" : "") + b.change.toFixed(1) + "%", b.x, b.y + b.r * 0.35);
        } else {
          ctx.font = `bold ${Math.max(7, b.r * 0.4)}px Inter, sans-serif`;
          ctx.fillText(b.symbol, b.x, b.y + 3);
        }
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [coins, view, timeRange, getChange]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight || 500;
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isWatched = (sym: string) => state.watch.includes(sym.toUpperCase());
  const toggleWatch = (sym: string) => {
    const s = sym.toUpperCase();
    if (isWatched(s)) {
      setState(prev => ({ ...prev, watch: prev.watch.filter(w => w !== s) }));
    } else {
      setState(prev => ({ ...prev, watch: [...prev.watch, s] }));
      toast("Added " + s + " to watchlist", "good");
    }
  };

  const renderChangePill = (val: number) => {
    if (!val && val !== 0) return <span className="mono muted">—</span>;
    return (
      <span className={`mono ${val > 0 ? "good" : val < 0 ? "bad" : "muted"}`} style={{ fontWeight: 700, fontSize: 11 }}>
        {val > 0 ? "▲" : val < 0 ? "▼" : ""} {Math.abs(val).toFixed(2)}%
      </span>
    );
  };

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div className="seg">
          <button className={view === "bubbles" ? "active" : ""} onClick={() => setView("bubbles")}>Bubbles</button>
          <button className={view === "table" ? "active" : ""} onClick={() => setView("table")}>Table</button>
        </div>
        <div className="seg">
          {TIME_RANGES.map(t => (
            <button key={t.key} className={timeRange === t.key ? "active" : ""} onClick={() => setTimeRange(t.key)}>{t.label}</button>
          ))}
        </div>
        <div className="seg">
          {[50, 100].map(n => (
            <button key={n} className={coinCount === n ? "active" : ""} onClick={() => setCoinCount(n)}>1-{n}</button>
          ))}
        </div>
        <span className="pill">{coins.length} coins</span>
      </div>

      {loading && (
        <div className="panel"><div className="panel-body muted">Loading market data…</div></div>
      )}

      {/* Bubbles View */}
      {!loading && view === "bubbles" && (
        <div className="panel" style={{ overflow: "hidden" }}>
          <div ref={containerRef} style={{ width: "100%", height: 500, position: "relative", background: "var(--bg)" }}>
            <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
          </div>
        </div>
      )}

      {/* Table View */}
      {!loading && view === "table" && (
        <div className="panel">
          <div className="panel-head">
            <h2>Live Market Prices</h2>
            <span className="pill">{coins.length} coins</span>
          </div>
          <div className="panel-body" style={{ padding: 0 }}>
            <div className="tableWrap" style={{ maxHeight: 600, overflow: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 30 }}></th>
                    <th>#</th>
                    <th>Name</th>
                    <th>1h %</th>
                    <th>24h %</th>
                    <th>7d %</th>
                    <th>Price</th>
                    <th>Market Cap</th>
                    <th>Volume 24h</th>
                  </tr>
                </thead>
                <tbody>
                  {coins.map(coin => (
                    <tr key={coin.id}>
                      <td>
                        <span
                          onClick={() => toggleWatch(coin.symbol)}
                          style={{ cursor: "pointer", fontSize: 14, color: isWatched(coin.symbol) ? "var(--warn)" : "var(--muted2)" }}
                        >
                          {isWatched(coin.symbol) ? "★" : "☆"}
                        </span>
                      </td>
                      <td className="mono muted">{coin.market_cap_rank}</td>
                      <td>
                        <span className="mono" style={{ fontWeight: 900 }}>{coin.name}</span>
                        <span className="muted" style={{ marginLeft: 6, fontSize: 10 }}>· {coin.symbol.toUpperCase()}</span>
                      </td>
                      <td>{renderChangePill(coin.price_change_percentage_1h_in_currency)}</td>
                      <td>{renderChangePill(coin.price_change_percentage_24h_in_currency)}</td>
                      <td>{renderChangePill(coin.price_change_percentage_7d_in_currency)}</td>
                      <td className="mono" style={{ fontWeight: 700, color: "var(--brand)" }}>
                        ${coin.current_price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: coin.current_price < 1 ? 6 : 2 })}
                      </td>
                      <td className="mono">{formatCompact(coin.market_cap)}</td>
                      <td className="mono">{formatCompact(coin.total_volume)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
