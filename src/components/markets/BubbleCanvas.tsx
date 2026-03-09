import { useEffect, useRef, useCallback } from "react";
import type { LiveCoin } from "@/hooks/useLivePrices";

interface Props {
  coins: LiveCoin[];
  timeRange: string;
}

interface Bubble {
  id: string; symbol: string; name: string; price: number;
  change: number; marketCap: number; image: string;
  x: number; y: number; r: number; vx: number; vy: number;
  targetX: number; targetY: number;
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

const _imgCache = new Map<string, HTMLImageElement>();
function preloadImage(url: string) {
  if (!url || _imgCache.has(url)) return;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  _imgCache.set(url, img);
}

export default function BubbleCanvas({ coins, timeRange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bubblesRef = useRef<Bubble[]>([]);
  const animRef = useRef<number>(0);
  const mouseRef = useRef({ x: -999, y: -999 });

  // Pack bubbles using a spiral layout to avoid overlap from the start
  const initBubbles = useCallback(() => {
    if (!coins.length) return;
    const container = containerRef.current;
    if (!container) return;
    const W = container.clientWidth;
    const H = container.clientHeight || 550;
    const maxMcap = Math.max(...coins.map(c => c.market_cap || 1));

    for (const coin of coins) preloadImage(coin.image);

    // Sort by market cap descending for spiral packing (big first)
    const sortedCoins = [...coins].sort((a, b) => (b.market_cap || 0) - (a.market_cap || 0));

    const bubbles: Bubble[] = [];
    const cx = W / 2;
    const cy = H / 2;

    // Spiral placement: place each bubble at increasing angles/radii
    let angle = 0;
    let radius = 0;
    const placed: { x: number; y: number; r: number }[] = [];

    for (const coin of sortedCoins) {
      const change = getChange(coin, timeRange);
      const mcapRatio = Math.sqrt((coin.market_cap || 1) / maxMcap);
      const br = Math.max(12, Math.min(52, mcapRatio * 52));

      // Find position via spiral that doesn't overlap
      let px = cx, py = cy;
      let found = false;
      for (let attempt = 0; attempt < 500; attempt++) {
        px = cx + Math.cos(angle) * radius;
        py = cy + Math.sin(angle) * radius;

        // Check bounds
        if (px - br < 2) px = br + 2;
        if (px + br > W - 2) px = W - br - 2;
        if (py - br < 2) py = br + 2;
        if (py + br > H - 2) py = H - br - 2;

        // Check overlap with already placed
        let overlaps = false;
        for (const p of placed) {
          const dx = px - p.x, dy = py - p.y;
          const minDist = br + p.r + 3; // 3px gap
          if (dx * dx + dy * dy < minDist * minDist) {
            overlaps = true;
            break;
          }
        }

        if (!overlaps) { found = true; break; }
        angle += 0.3;
        radius += 0.8;
      }

      if (!found) {
        // Fallback: random position
        px = Math.random() * (W - br * 2) + br;
        py = Math.random() * (H - br * 2) + br;
      }

      placed.push({ x: px, y: py, r: br });
      bubbles.push({
        id: coin.id, symbol: coin.symbol.toUpperCase(), name: coin.name,
        price: coin.current_price, change, marketCap: coin.market_cap,
        image: coin.image || "",
        x: px, y: py, r: br,
        vx: 0, vy: 0,
        targetX: px, targetY: py,
      });
    }

    bubblesRef.current = bubbles;
  }, [coins, timeRange]);

  useEffect(() => {
    initBubbles();

    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const setupCanvas = () => {
      const W = container.clientWidth;
      const H = container.clientHeight || 550;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      const ctx = canvas.getContext("2d")!;
      ctx.scale(dpr, dpr);
      return { W, H, ctx };
    };

    let { W, H, ctx } = setupCanvas();

    const animate = () => {
      const bubbles = bubblesRef.current;
      ctx.clearRect(0, 0, W, H);
      let hovered: Bubble | null = null;
      const mx = mouseRef.current.x, my = mouseRef.current.y;

      // Very gentle physics: strong spring to target, almost no random drift
      for (const b of bubbles) {
        // Strong spring back to target (keeps bubbles nearly still)
        const dx = b.targetX - b.x;
        const dy = b.targetY - b.y;
        b.vx += dx * 0.008;
        b.vy += dy * 0.008;

        // Extremely subtle random drift (barely perceptible)
        b.vx += (Math.random() - 0.5) * 0.003;
        b.vy += (Math.random() - 0.5) * 0.003;

        // Very heavy damping
        b.vx *= 0.85;
        b.vy *= 0.85;

        // Clamp max velocity to prevent fast movement
        const maxV = 0.15;
        const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        if (speed > maxV) {
          b.vx = (b.vx / speed) * maxV;
          b.vy = (b.vy / speed) * maxV;
        }

        b.x += b.vx;
        b.y += b.vy;

        // Walls
        if (b.x - b.r < 0) { b.x = b.r; b.vx = 0; }
        if (b.x + b.r > W) { b.x = W - b.r; b.vx = 0; }
        if (b.y - b.r < 0) { b.y = b.r; b.vy = 0; }
        if (b.y + b.r > H) { b.y = H - b.r; b.vy = 0; }

        // Hover detection
        const mdx = mx - b.x, mdy = my - b.y;
        if (Math.sqrt(mdx * mdx + mdy * mdy) < b.r) hovered = b;
      }

      // Strong collision separation to prevent any overlap
      for (let iter = 0; iter < 3; iter++) {
        for (let i = 0; i < bubbles.length; i++) {
          for (let j = i + 1; j < bubbles.length; j++) {
            const a = bubbles[i], bb = bubbles[j];
            const dx = bb.x - a.x, dy = bb.y - a.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const minDist = a.r + bb.r + 3;
            if (dist < minDist && dist > 0.01) {
              const overlap = minDist - dist;
              const nx = dx / dist, ny = dy / dist;
              // Push apart immediately (position-based, not velocity)
              a.x -= nx * overlap * 0.5;
              a.y -= ny * overlap * 0.5;
              bb.x += nx * overlap * 0.5;
              bb.y += ny * overlap * 0.5;
              // Kill velocity toward each other
              a.vx = 0; a.vy = 0;
              bb.vx = 0; bb.vy = 0;
            }
          }
        }
      }

      // Draw bubbles
      for (const b of bubbles) {
        const isPos = b.change >= 0;
        const intensity = Math.min(Math.abs(b.change) / 10, 1);
        const isHov = hovered === b;
        const scale = isHov ? 1.1 : 1;
        const dr = b.r * scale;

        // Hover glow
        if (isHov) {
          ctx.beginPath();
          ctx.arc(b.x, b.y, dr + 6, 0, Math.PI * 2);
          const glow = ctx.createRadialGradient(b.x, b.y, dr * 0.4, b.x, b.y, dr + 6);
          glow.addColorStop(0, isPos ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)");
          glow.addColorStop(1, "transparent");
          ctx.fillStyle = glow;
          ctx.fill();
        }

        // Bubble fill
        const alpha = 0.15 + intensity * 0.3;
        ctx.beginPath();
        ctx.arc(b.x, b.y, dr, 0, Math.PI * 2);
        ctx.fillStyle = isPos ? `rgba(34,197,94,${alpha})` : `rgba(239,68,68,${alpha})`;
        ctx.fill();

        // Border
        ctx.strokeStyle = isPos
          ? `rgba(34,197,94,${0.25 + intensity * 0.3})`
          : `rgba(239,68,68,${0.25 + intensity * 0.3})`;
        ctx.lineWidth = isHov ? 2 : 1;
        ctx.stroke();

        // Icon
        if (b.image && b.r > 16) {
          const img = _imgCache.get(b.image);
          if (img?.complete && img.naturalWidth > 0) {
            const iconSize = Math.min(dr * 0.35, 16);
            const iconY = b.r > 26 ? b.y - dr * 0.15 : b.y;
            ctx.save();
            ctx.beginPath();
            ctx.arc(b.x, iconY, iconSize, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(img, b.x - iconSize, iconY - iconSize, iconSize * 2, iconSize * 2);
            ctx.restore();
          }
        }

        // Text
        ctx.textAlign = "center";
        if (b.r > 26) {
          ctx.fillStyle = isPos ? "#4ade80" : "#f87171";
          ctx.font = `bold ${Math.max(9, dr * 0.26)}px system-ui, sans-serif`;
          const symY = b.image ? b.y + dr * 0.38 : b.y - 1;
          ctx.fillText(b.symbol, b.x, symY);
          ctx.font = `600 ${Math.max(7, dr * 0.18)}px system-ui, sans-serif`;
          ctx.fillStyle = "rgba(255,255,255,0.5)";
          ctx.fillText((b.change >= 0 ? "+" : "") + b.change.toFixed(1) + "%", b.x, symY + dr * 0.22);
        } else if (b.r > 14) {
          ctx.fillStyle = isPos ? "#4ade80" : "#f87171";
          ctx.font = `bold ${Math.max(7, dr * 0.38)}px system-ui, sans-serif`;
          ctx.fillText(b.symbol, b.x, b.y + 3);
        }
      }

      // Tooltip
      if (hovered) {
        const b = hovered;
        const tw = 165, th = 64;
        let tx = b.x + b.r + 12, ty = b.y - th / 2;
        if (tx + tw > W) tx = b.x - b.r - tw - 12;
        if (ty < 4) ty = 4;
        if (ty + th > H - 4) ty = H - th - 4;

        ctx.shadowColor = "rgba(0,0,0,0.35)";
        ctx.shadowBlur = 16;
        ctx.fillStyle = "rgba(12,12,18,0.94)";
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
        ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineWidth = 1; ctx.stroke();

        ctx.textAlign = "left";
        ctx.fillStyle = "#fff"; ctx.font = "bold 12px system-ui";
        ctx.fillText(b.symbol, tx + 10, ty + 16);
        ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.font = "10px system-ui";
        ctx.fillText(b.name, tx + 10 + ctx.measureText(b.symbol + " ").width + 2, ty + 16);
        ctx.fillStyle = "#fff"; ctx.font = "bold 13px system-ui";
        ctx.fillText("$" + b.price.toLocaleString(undefined, { maximumFractionDigits: b.price < 1 ? 6 : 2 }), tx + 10, ty + 34);
        ctx.fillStyle = b.change >= 0 ? "#4ade80" : "#f87171"; ctx.font = "bold 10px system-ui";
        ctx.fillText(`${b.change >= 0 ? "+" : ""}${b.change.toFixed(2)}%`, tx + 10, ty + 50);
        ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.font = "10px system-ui"; ctx.textAlign = "right";
        ctx.fillText(formatCompact(b.marketCap), tx + tw - 10, ty + 50);
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    const onResize = () => { ({ W, H, ctx } = setupCanvas()); };
    window.addEventListener("resize", onResize);
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener("resize", onResize); };
  }, [initBubbles]);

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

  return (
    <div className="panel" style={{ overflow: "hidden" }}>
      <div ref={containerRef} className="markets-canvas-wrap"
        style={{ width: "100%", height: 550, position: "relative", background: "var(--bg)" }}>
        <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%", cursor: "crosshair" }} />
      </div>
    </div>
  );
}
