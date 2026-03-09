import { useEffect, useRef } from "react";
import type { LiveCoin } from "@/hooks/useLivePrices";

interface Props {
  coins: LiveCoin[];
  timeRange: string;
}

interface Bubble {
  id: string; symbol: string; name: string; price: number;
  change: number; marketCap: number; image: string;
  x: number; y: number; r: number; vx: number; vy: number;
}

function getChange(coin: LiveCoin, timeRange: string) {
  switch (timeRange) {
    case "1h": return coin.price_change_percentage_1h_in_currency || 0;
    case "7d": return coin.price_change_percentage_7d_in_currency || 0;
    default: return coin.price_change_percentage_24h_in_currency || 0;
  }
}

function formatCompact(n: number): string {
  if (n >= 1e12) return "$" + (n / 1e12).toFixed(1) + "T";
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(0) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(0) + "M";
  return "$" + n.toLocaleString();
}

// Pre-load coin images for canvas rendering
const _imgCache = new Map<string, HTMLImageElement>();
function getCoinImage(url: string): HTMLImageElement | null {
  if (!url) return null;
  if (_imgCache.has(url)) return _imgCache.get(url)!;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  _imgCache.set(url, img);
  return null; // Not ready yet
}

export default function BubbleCanvas({ coins, timeRange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bubblesRef = useRef<Bubble[]>([]);
  const animRef = useRef<number>(0);
  const mouseRef = useRef({ x: -999, y: -999 });

  useEffect(() => {
    if (!coins.length) return;
    const container = containerRef.current;
    if (!container) return;
    const W = container.clientWidth;
    const H = container.clientHeight || 550;
    const maxMcap = Math.max(...coins.map(c => c.market_cap || 1));

    // Preload images
    for (const coin of coins) {
      if (coin.image) getCoinImage(coin.image);
    }

    bubblesRef.current = coins.map((coin) => {
      const change = getChange(coin, timeRange);
      const mcapRatio = Math.sqrt((coin.market_cap || 1) / maxMcap);
      const r = Math.max(16, Math.min(62, mcapRatio * 62));
      return {
        id: coin.id, symbol: coin.symbol.toUpperCase(), name: coin.name,
        price: coin.current_price, change, marketCap: coin.market_cap,
        image: coin.image || "",
        x: Math.random() * (W - r * 2) + r,
        y: Math.random() * (H - r * 2) + r,
        r, vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
      };
    });

    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    const animate = () => {
      const bubbles = bubblesRef.current;
      ctx.clearRect(0, 0, W, H);
      let hovered: Bubble | null = null;
      const mx = mouseRef.current.x, my = mouseRef.current.y;

      // Physics
      for (const b of bubbles) {
        b.x += b.vx; b.y += b.vy;
        if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.7; }
        if (b.x + b.r > W) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * 0.7; }
        if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.7; }
        if (b.y + b.r > H) { b.y = H - b.r; b.vy = -Math.abs(b.vy) * 0.7; }
        b.vx *= 0.999; b.vy *= 0.999;
        const dx = mx - b.x, dy = my - b.y;
        if (Math.sqrt(dx * dx + dy * dy) < b.r) hovered = b;
      }

      // Collisions
      for (let i = 0; i < bubbles.length; i++) {
        for (let j = i + 1; j < bubbles.length; j++) {
          const a = bubbles[i], bb = bubbles[j];
          const dx = bb.x - a.x, dy = bb.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = a.r + bb.r;
          if (dist < minDist && dist > 0) {
            const overlap = (minDist - dist) / 2;
            const nx = dx / dist, ny = dy / dist;
            a.x -= nx * overlap * 0.5; a.y -= ny * overlap * 0.5;
            bb.x += nx * overlap * 0.5; bb.y += ny * overlap * 0.5;
            const dvx = a.vx - bb.vx, dvy = a.vy - bb.vy;
            const dvn = dvx * nx + dvy * ny;
            if (dvn > 0) {
              a.vx -= dvn * nx * 0.25; a.vy -= dvn * ny * 0.25;
              bb.vx += dvn * nx * 0.25; bb.vy += dvn * ny * 0.25;
            }
          }
        }
      }

      // Draw bubbles
      for (const b of bubbles) {
        const isPos = b.change >= 0;
        const intensity = Math.min(Math.abs(b.change) / 12, 1);
        const isHov = hovered === b;
        const scale = isHov ? 1.08 : 1;
        const dr = b.r * scale;

        // Glow
        if (isHov) {
          ctx.beginPath();
          ctx.arc(b.x, b.y, dr + 6, 0, Math.PI * 2);
          const glow = ctx.createRadialGradient(b.x, b.y, dr * 0.5, b.x, b.y, dr + 6);
          glow.addColorStop(0, isPos ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)");
          glow.addColorStop(1, "transparent");
          ctx.fillStyle = glow;
          ctx.fill();
        }

        // Main circle
        const alpha = 0.12 + intensity * 0.28;
        ctx.beginPath();
        ctx.arc(b.x, b.y, dr, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(b.x, b.y - dr * 0.3, dr * 0.1, b.x, b.y, dr);
        if (isPos) {
          grad.addColorStop(0, `rgba(34,197,94,${alpha + 0.1})`);
          grad.addColorStop(1, `rgba(22,163,74,${alpha})`);
        } else {
          grad.addColorStop(0, `rgba(248,113,113,${alpha + 0.1})`);
          grad.addColorStop(1, `rgba(220,38,38,${alpha})`);
        }
        ctx.fillStyle = grad;
        ctx.fill();

        // Border
        ctx.strokeStyle = isPos
          ? `rgba(34,197,94,${0.25 + intensity * 0.4})`
          : `rgba(248,113,113,${0.25 + intensity * 0.4})`;
        ctx.lineWidth = isHov ? 2 : 1;
        ctx.stroke();

        // Coin icon
        if (b.image && b.r > 20) {
          const img = _imgCache.get(b.image);
          if (img?.complete && img.naturalWidth > 0) {
            const iconSize = Math.min(dr * 0.5, 22);
            ctx.save();
            ctx.beginPath();
            ctx.arc(b.x, b.y - (b.r > 30 ? 5 : 0), iconSize, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(img, b.x - iconSize, b.y - (b.r > 30 ? 5 : 0) - iconSize, iconSize * 2, iconSize * 2);
            ctx.restore();
          }
        }

        // Text
        ctx.textAlign = "center";
        if (b.r > 28) {
          // Symbol below icon
          ctx.fillStyle = isPos ? "#4ade80" : "#f87171";
          ctx.font = `bold ${Math.max(9, dr * 0.24)}px var(--app-font, Inter), sans-serif`;
          const textY = b.image ? b.y + dr * 0.35 : b.y - 3;
          ctx.fillText(b.symbol, b.x, textY);
          // Change %
          ctx.font = `${Math.max(8, dr * 0.19)}px var(--app-font, Inter), sans-serif`;
          ctx.fillStyle = "rgba(255,255,255,0.6)";
          ctx.fillText((b.change >= 0 ? "+" : "") + b.change.toFixed(1) + "%", b.x, textY + dr * 0.22);
        } else if (b.r > 18) {
          ctx.fillStyle = isPos ? "#4ade80" : "#f87171";
          ctx.font = `bold ${Math.max(8, dr * 0.36)}px var(--app-font, Inter), sans-serif`;
          ctx.fillText(b.symbol, b.x, b.y + 3);
        }
      }

      // Tooltip
      if (hovered) {
        const b = hovered;
        const tw = 180, th = 72;
        let tx = b.x + b.r + 12, ty = b.y - th / 2;
        if (tx + tw > W) tx = b.x - b.r - tw - 12;
        if (ty < 4) ty = 4; if (ty + th > H - 4) ty = H - th - 4;

        // Shadow
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 16;
        ctx.fillStyle = "rgba(15,15,20,0.92)";
        const rr = 8;
        ctx.beginPath();
        ctx.moveTo(tx + rr, ty); ctx.lineTo(tx + tw - rr, ty);
        ctx.quadraticCurveTo(tx + tw, ty, tx + tw, ty + rr);
        ctx.lineTo(tx + tw, ty + th - rr);
        ctx.quadraticCurveTo(tx + tw, ty + th, tx + tw - rr, ty + th);
        ctx.lineTo(tx + rr, ty + th);
        ctx.quadraticCurveTo(tx, ty + th, tx, ty + th - rr);
        ctx.lineTo(tx, ty + rr);
        ctx.quadraticCurveTo(tx, ty, tx + rr, ty);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Border
        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Content
        ctx.textAlign = "left";
        ctx.fillStyle = "#fff"; ctx.font = "bold 12px var(--app-font, Inter)";
        ctx.fillText(`${b.symbol}`, tx + 10, ty + 18);
        ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.font = "11px var(--app-font, Inter)";
        ctx.fillText(b.name, tx + 10 + ctx.measureText(b.symbol + " ").width + 4, ty + 18);

        ctx.fillStyle = "#fff"; ctx.font = "bold 13px var(--app-font, Inter)";
        ctx.fillText("$" + b.price.toLocaleString(undefined, { maximumFractionDigits: b.price < 1 ? 6 : 2 }), tx + 10, ty + 38);

        ctx.fillStyle = b.change >= 0 ? "#4ade80" : "#f87171";
        ctx.font = "bold 11px var(--app-font, Inter)";
        ctx.fillText(`${b.change >= 0 ? "+" : ""}${b.change.toFixed(2)}%`, tx + 10, ty + 56);

        ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.font = "11px var(--app-font, Inter)";
        ctx.textAlign = "right";
        ctx.fillText(`MCap ${formatCompact(b.marketCap)}`, tx + tw - 10, ty + 56);
      }

      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [coins, timeRange]);

  // Mouse tracking
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const h = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const leave = () => { mouseRef.current = { x: -999, y: -999 }; };
    canvas.addEventListener("mousemove", h);
    canvas.addEventListener("mouseleave", leave);
    return () => { canvas.removeEventListener("mousemove", h); canvas.removeEventListener("mouseleave", leave); };
  }, []);

  // Resize
  useEffect(() => {
    const h = () => {
      const container = containerRef.current, canvas = canvasRef.current;
      if (!container || !canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const W = container.clientWidth;
      const H = container.clientHeight || 550;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(dpr, dpr);
    };
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  return (
    <div className="panel" style={{ overflow: "hidden" }}>
      <div ref={containerRef} style={{ width: "100%", height: 550, position: "relative", background: "var(--bg)" }}>
        <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%", cursor: "crosshair" }} />
      </div>
    </div>
  );
}
