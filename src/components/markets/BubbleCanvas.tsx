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
function getCoinImage(url: string): HTMLImageElement | null {
  if (!url) return null;
  if (_imgCache.has(url)) {
    const img = _imgCache.get(url)!;
    return img.complete && img.naturalWidth > 0 ? img : null;
  }
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  _imgCache.set(url, img);
  return null;
}

export default function BubbleCanvas({ coins, timeRange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bubblesRef = useRef<Bubble[]>([]);
  const animRef = useRef<number>(0);
  const mouseRef = useRef({ x: -999, y: -999 });

  const initBubbles = useCallback(() => {
    if (!coins.length) return;
    const container = containerRef.current;
    if (!container) return;
    const W = container.clientWidth;
    const H = container.clientHeight || 550;
    const maxMcap = Math.max(...coins.map(c => c.market_cap || 1));

    for (const coin of coins) {
      if (coin.image) getCoinImage(coin.image);
    }

    // Pack bubbles in a grid-like pattern for stability
    const bubbles: Bubble[] = [];
    const cols = Math.ceil(Math.sqrt(coins.length * (W / H)));
    const rows = Math.ceil(coins.length / cols);
    const cellW = W / cols;
    const cellH = H / rows;

    coins.forEach((coin, i) => {
      const change = getChange(coin, timeRange);
      const mcapRatio = Math.sqrt((coin.market_cap || 1) / maxMcap);
      const r = Math.max(14, Math.min(56, mcapRatio * 56));
      const col = i % cols;
      const row = Math.floor(i / cols);
      const tx = cellW * col + cellW / 2;
      const ty = cellH * row + cellH / 2;

      bubbles.push({
        id: coin.id, symbol: coin.symbol.toUpperCase(), name: coin.name,
        price: coin.current_price, change, marketCap: coin.market_cap,
        image: coin.image || "",
        x: tx + (Math.random() - 0.5) * 20,
        y: ty + (Math.random() - 0.5) * 20,
        r, vx: 0, vy: 0,
        targetX: tx, targetY: ty,
      });
    });

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

      // Gentle physics: attract to target, very slow drift
      for (const b of bubbles) {
        // Spring force toward target position (keeps bubbles settled)
        const dx = b.targetX - b.x;
        const dy = b.targetY - b.y;
        b.vx += dx * 0.002;
        b.vy += dy * 0.002;

        // Gentle random drift
        b.vx += (Math.random() - 0.5) * 0.015;
        b.vy += (Math.random() - 0.5) * 0.015;

        // Heavy damping = slow, calm movement
        b.vx *= 0.92;
        b.vy *= 0.92;

        b.x += b.vx;
        b.y += b.vy;

        // Soft wall bounce
        if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.3; }
        if (b.x + b.r > W) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * 0.3; }
        if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.3; }
        if (b.y + b.r > H) { b.y = H - b.r; b.vy = -Math.abs(b.vy) * 0.3; }

        const mdx = mx - b.x, mdy = my - b.y;
        if (Math.sqrt(mdx * mdx + mdy * mdy) < b.r) hovered = b;
      }

      // Gentle collision separation
      for (let i = 0; i < bubbles.length; i++) {
        for (let j = i + 1; j < bubbles.length; j++) {
          const a = bubbles[i], bb = bubbles[j];
          const dx = bb.x - a.x, dy = bb.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = a.r + bb.r + 2;
          if (dist < minDist && dist > 0) {
            const overlap = (minDist - dist) / 2;
            const nx = dx / dist, ny = dy / dist;
            a.x -= nx * overlap * 0.3;
            a.y -= ny * overlap * 0.3;
            bb.x += nx * overlap * 0.3;
            bb.y += ny * overlap * 0.3;
          }
        }
      }

      // Draw
      for (const b of bubbles) {
        const isPos = b.change >= 0;
        const intensity = Math.min(Math.abs(b.change) / 10, 1);
        const isHov = hovered === b;
        const scale = isHov ? 1.12 : 1;
        const dr = b.r * scale;

        // Soft glow on hover
        if (isHov) {
          ctx.beginPath();
          ctx.arc(b.x, b.y, dr + 8, 0, Math.PI * 2);
          const glow = ctx.createRadialGradient(b.x, b.y, dr * 0.4, b.x, b.y, dr + 8);
          glow.addColorStop(0, isPos ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)");
          glow.addColorStop(1, "transparent");
          ctx.fillStyle = glow;
          ctx.fill();
        }

        // Main bubble - solid, clean look
        const alpha = 0.18 + intensity * 0.32;
        ctx.beginPath();
        ctx.arc(b.x, b.y, dr, 0, Math.PI * 2);
        if (isPos) {
          ctx.fillStyle = `rgba(34,197,94,${alpha})`;
        } else {
          ctx.fillStyle = `rgba(239,68,68,${alpha})`;
        }
        ctx.fill();

        // Clean border
        ctx.strokeStyle = isPos
          ? `rgba(34,197,94,${0.3 + intensity * 0.35})`
          : `rgba(239,68,68,${0.3 + intensity * 0.35})`;
        ctx.lineWidth = isHov ? 2.5 : 1.5;
        ctx.stroke();

        // Coin icon
        if (b.image && b.r > 18) {
          const img = _imgCache.get(b.image);
          if (img?.complete && img.naturalWidth > 0) {
            const iconSize = Math.min(dr * 0.38, 18);
            const iconY = b.r > 28 ? b.y - dr * 0.15 : b.y;
            ctx.save();
            ctx.beginPath();
            ctx.arc(b.x, iconY, iconSize, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(img, b.x - iconSize, iconY - iconSize, iconSize * 2, iconSize * 2);
            ctx.restore();
          }
        }

        // Text - symbol prominent
        ctx.textAlign = "center";
        if (b.r > 28) {
          // Symbol
          ctx.fillStyle = isPos ? "#4ade80" : "#f87171";
          ctx.font = `bold ${Math.max(10, dr * 0.28)}px var(--app-font, system-ui)`;
          const symY = b.image ? b.y + dr * 0.4 : b.y - 2;
          ctx.fillText(b.symbol, b.x, symY);
          // Change %
          ctx.font = `600 ${Math.max(8, dr * 0.2)}px var(--app-font, system-ui)`;
          ctx.fillStyle = "rgba(255,255,255,0.55)";
          ctx.fillText((b.change >= 0 ? "+" : "") + b.change.toFixed(1) + "%", b.x, symY + dr * 0.24);
        } else if (b.r > 16) {
          ctx.fillStyle = isPos ? "#4ade80" : "#f87171";
          ctx.font = `bold ${Math.max(8, dr * 0.4)}px var(--app-font, system-ui)`;
          ctx.fillText(b.symbol, b.x, b.y + 4);
        }
      }

      // Tooltip
      if (hovered) {
        const b = hovered;
        const tw = 170, th = 68;
        let tx = b.x + b.r + 14, ty = b.y - th / 2;
        if (tx + tw > W) tx = b.x - b.r - tw - 14;
        if (ty < 4) ty = 4;
        if (ty + th > H - 4) ty = H - th - 4;

        ctx.shadowColor = "rgba(0,0,0,0.4)";
        ctx.shadowBlur = 20;
        ctx.fillStyle = "rgba(12,12,18,0.94)";
        const rr = 10;
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

        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.textAlign = "left";
        ctx.fillStyle = "#fff";
        ctx.font = "bold 13px var(--app-font, system-ui)";
        ctx.fillText(b.symbol, tx + 12, ty + 18);

        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.font = "10px var(--app-font, system-ui)";
        const symW = ctx.measureText(b.symbol + "  ").width;
        ctx.fillText(b.name, tx + 12 + symW, ty + 18);

        ctx.fillStyle = "#fff";
        ctx.font = "bold 14px var(--app-font, system-ui)";
        ctx.fillText("$" + b.price.toLocaleString(undefined, { maximumFractionDigits: b.price < 1 ? 6 : 2 }), tx + 12, ty + 38);

        ctx.fillStyle = b.change >= 0 ? "#4ade80" : "#f87171";
        ctx.font = "bold 11px var(--app-font, system-ui)";
        ctx.fillText(`${b.change >= 0 ? "+" : ""}${b.change.toFixed(2)}%`, tx + 12, ty + 54);

        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.font = "10px var(--app-font, system-ui)";
        ctx.textAlign = "right";
        ctx.fillText(formatCompact(b.marketCap), tx + tw - 12, ty + 54);
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    const handleResize = () => {
      ({ W, H, ctx } = setupCanvas());
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", handleResize);
    };
  }, [initBubbles]);

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

  return (
    <div className="panel" style={{ overflow: "hidden" }}>
      <div
        ref={containerRef}
        className="markets-canvas-wrap"
        style={{ width: "100%", height: 550, position: "relative", background: "var(--bg)" }}
      >
        <canvas
          ref={canvasRef}
          style={{ display: "block", width: "100%", height: "100%", cursor: "crosshair" }}
        />
      </div>
    </div>
  );
}
