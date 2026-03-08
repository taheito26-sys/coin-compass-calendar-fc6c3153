import { useState, useEffect, useRef, useCallback } from "react";
import { useCrypto } from "@/lib/cryptoContext";
import { useLivePrices, type LiveCoin } from "@/hooks/useLivePrices";

interface Bubble {
  id: string; symbol: string; name: string; price: number;
  change: number; marketCap: number;
  x: number; y: number; r: number; vx: number; vy: number;
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

function getChange(coin: LiveCoin, timeRange: string) {
  switch (timeRange) {
    case "1h": return coin.price_change_percentage_1h_in_currency || 0;
    case "7d": return coin.price_change_percentage_7d_in_currency || 0;
    default: return coin.price_change_percentage_24h_in_currency || 0;
  }
}

export default function MarketsPage() {
  const { state, setState, toast } = useCrypto();
  const { coins: allCoins, loading } = useLivePrices();
  const [view, setView] = useState<"bubbles" | "table">("bubbles");
  const [timeRange, setTimeRange] = useState("24h");
  const [coinCount, setCoinCount] = useState(100);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bubblesRef = useRef<Bubble[]>([]);
  const animRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const hoveredRef = useRef<Bubble | null>(null);
  const mouseRef = useRef({ x: 0, y: 0 });

  const coins = allCoins.slice(0, coinCount);

  // Initialize bubbles
  useEffect(() => {
    if (coins.length === 0 || view !== "bubbles") return;
    const container = containerRef.current;
    if (!container) return;
    const W = container.clientWidth;
    const H = container.clientHeight || 500;
    const maxMcap = Math.max(...coins.map(c => c.market_cap || 1));

    bubblesRef.current = coins.map((coin) => {
      const change = getChange(coin, timeRange);
      const mcapRatio = Math.sqrt((coin.market_cap || 1) / maxMcap);
      const r = Math.max(14, Math.min(55, mcapRatio * 55));
      return {
        id: coin.id, symbol: coin.symbol.toUpperCase(), name: coin.name,
        price: coin.current_price, change, marketCap: coin.market_cap,
        x: Math.random() * (W - r * 2) + r,
        y: Math.random() * (H - r * 2) + r,
        r, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
      };
    });

    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const animate = () => {
      const bubbles = bubblesRef.current;
      ctx.clearRect(0, 0, W, H);
      let hovered: Bubble | null = null;
      const mx = mouseRef.current.x, my = mouseRef.current.y;

      for (const b of bubbles) {
        b.x += b.vx; b.y += b.vy;
        if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.8; }
        if (b.x + b.r > W) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * 0.8; }
        if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.8; }
        if (b.y + b.r > H) { b.y = H - b.r; b.vy = -Math.abs(b.vy) * 0.8; }
        b.vx *= 0.998; b.vy *= 0.998;

        const dx = mx - b.x, dy = my - b.y;
        if (Math.sqrt(dx * dx + dy * dy) < b.r) hovered = b;
      }
      hoveredRef.current = hovered;

      // Collision
      for (let i = 0; i < bubbles.length; i++) {
        for (let j = i + 1; j < bubbles.length; j++) {
          const a = bubbles[i], b = bubbles[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = a.r + b.r;
          if (dist < minDist && dist > 0) {
            const overlap = (minDist - dist) / 2;
            const nx = dx / dist, ny = dy / dist;
            a.x -= nx * overlap * 0.5; a.y -= ny * overlap * 0.5;
            b.x += nx * overlap * 0.5; b.y += ny * overlap * 0.5;
            const dvx = a.vx - b.vx, dvy = a.vy - b.vy;
            const dvn = dvx * nx + dvy * ny;
            if (dvn > 0) {
              a.vx -= dvn * nx * 0.3; a.vy -= dvn * ny * 0.3;
              b.vx += dvn * nx * 0.3; b.vy += dvn * ny * 0.3;
            }
          }
        }
      }

      // Draw
      for (const b of bubbles) {
        const isPos = b.change >= 0;
        const intensity = Math.min(Math.abs(b.change) / 15, 1);
        const isHov = hovered === b;
        const alpha = 0.15 + intensity * 0.35 + (isHov ? 0.15 : 0);

        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r + (isHov ? 2 : 0), 0, Math.PI * 2);
        ctx.fillStyle = isPos
          ? `rgba(22, 163, 74, ${alpha})`
          : `rgba(220, 38, 38, ${alpha})`;
        ctx.fill();
        ctx.strokeStyle = isPos
          ? `rgba(22, 163, 74, ${0.3 + intensity * 0.5})`
          : `rgba(220, 38, 38, ${0.3 + intensity * 0.5})`;
        ctx.lineWidth = isHov ? 2.5 : 1.5;
        ctx.stroke();

        ctx.textAlign = "center";
        ctx.fillStyle = isPos ? "#4ade80" : "#f87171";
        if (b.r > 22) {
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

      // Tooltip
      if (hovered) {
        const b = hovered;
        const tw = 160, th = 60;
        let tx = b.x + b.r + 10, ty = b.y - th / 2;
        if (tx + tw > W) tx = b.x - b.r - tw - 10;
        if (ty < 0) ty = 4; if (ty + th > H) ty = H - th - 4;
        ctx.fillStyle = "rgba(0,0,0,0.85)";
        ctx.beginPath();
        const rr = 6;
        ctx.moveTo(tx + rr, ty); ctx.lineTo(tx + tw - rr, ty);
        ctx.quadraticCurveTo(tx + tw, ty, tx + tw, ty + rr);
        ctx.lineTo(tx + tw, ty + th - rr);
        ctx.quadraticCurveTo(tx + tw, ty + th, tx + tw - rr, ty + th);
        ctx.lineTo(tx + rr, ty + th);
        ctx.quadraticCurveTo(tx, ty + th, tx, ty + th - rr);
        ctx.lineTo(tx, ty + rr);
        ctx.quadraticCurveTo(tx, ty, tx + rr, ty);
        ctx.fill();
        ctx.fillStyle = "#fff"; ctx.font = "bold 11px Inter"; ctx.textAlign = "left";
        ctx.fillText(`${b.symbol} · ${b.name}`, tx + 8, ty + 16);
        ctx.font = "11px Inter"; ctx.fillStyle = "#aaa";
        ctx.fillText(`$${b.price.toLocaleString()}`, tx + 8, ty + 32);
        ctx.fillStyle = b.change >= 0 ? "#4ade80" : "#f87171";
        ctx.fillText(`${b.change >= 0 ? "+" : ""}${b.change.toFixed(2)}%`, tx + 8, ty + 48);
        ctx.fillStyle = "#777";
        ctx.fillText(formatCompact(b.marketCap), tx + 90, ty + 48);
      }

      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [coins, view, timeRange]);

  // Mouse tracking
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const h = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    canvas.addEventListener("mousemove", h);
    return () => canvas.removeEventListener("mousemove", h);
  }, []);

  // Resize
  useEffect(() => {
    const h = () => {
      const container = containerRef.current, canvas = canvasRef.current;
      if (!container || !canvas) return;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight || 500;
    };
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  const isWatched = (sym: string) => state.watch.includes(sym.toUpperCase());
  const toggleWatch = (sym: string) => {
    const s = sym.toUpperCase();
    if (isWatched(s)) setState(prev => ({ ...prev, watch: prev.watch.filter(w => w !== s) }));
    else { setState(prev => ({ ...prev, watch: [...prev.watch, s] })); toast("Added " + s + " to watchlist", "good"); }
  };

  const renderChangePill = (val: number | null) => {
    if (val == null) return <span className="mono muted">—</span>;
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
          {[100, 250, 500].map(n => (
            <button key={n} className={coinCount === n ? "active" : ""} onClick={() => setCoinCount(n)}>Top {n}</button>
          ))}
        </div>
        <span className="pill">{coins.length} coins</span>
      </div>

      {loading && <div className="panel"><div className="panel-body muted">Loading market data…</div></div>}

      {!loading && view === "bubbles" && (
        <div className="panel" style={{ overflow: "hidden" }}>
          <div ref={containerRef} className="markets-canvas-wrap" style={{ width: "100%", height: 500, position: "relative", background: "var(--bg)" }}>
            <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%", cursor: "crosshair" }} />
          </div>
        </div>
      )}

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
                        <span onClick={() => toggleWatch(coin.symbol)} style={{ cursor: "pointer", fontSize: 14, color: isWatched(coin.symbol) ? "var(--warn)" : "var(--muted2)" }}>
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
