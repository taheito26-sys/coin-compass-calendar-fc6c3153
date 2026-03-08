import { useRef, useEffect } from "react";

export function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || data.length < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const min = Math.min(...data), max = Math.max(...data);
    const range = max - min || 1;
    ctx.beginPath();
    ctx.strokeStyle = positive ? "var(--good, #16a34a)" : "var(--bad, #dc2626)";
    ctx.lineWidth = 1.5;
    data.forEach((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [data, positive]);
  return <canvas ref={ref} width={100} height={30} style={{ display: "block" }} />;
}
