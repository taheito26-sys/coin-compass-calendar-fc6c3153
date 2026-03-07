import { useState, useRef, useEffect } from "react";
import { useLivePrices } from "@/hooks/useLivePrices";

interface Props {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}

export default function CoinAutocomplete({ value, onChange, placeholder = "BTC" }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const { coins } = useLivePrices();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const q = value.toLowerCase().trim();
  const matches = q.length > 0
    ? coins.filter(c => c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)).slice(0, 8)
    : [];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, matches.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === "Enter" && matches[selected]) {
      e.preventDefault();
      onChange(matches[selected].symbol.toUpperCase());
      setOpen(false);
    }
    if (e.key === "Escape") setOpen(false);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        className="inp"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); setSelected(0); }}
        onFocus={() => value && setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />
      {open && matches.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 999,
          background: "var(--panel)", border: "1px solid var(--line)",
          borderRadius: "var(--lt-radius-sm, 8px)",
          maxHeight: 240, overflowY: "auto",
          boxShadow: "0 8px 30px rgba(0,0,0,.25)", marginTop: 2,
        }}>
          {matches.map((c, i) => (
            <div
              key={c.id}
              onClick={() => { onChange(c.symbol.toUpperCase()); setOpen(false); }}
              style={{
                padding: "6px 10px", cursor: "pointer", fontSize: 11,
                background: i === selected ? "var(--brand3)" : "transparent",
                borderBottom: "1px solid var(--line2)",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <img src={c.image} alt="" style={{ width: 16, height: 16, borderRadius: 8 }} />
                <span style={{ fontWeight: 700, color: "var(--text)" }}>{c.symbol.toUpperCase()}</span>
                <span style={{ color: "var(--muted)", fontSize: 10 }}>{c.name}</span>
              </div>
              <span className="mono" style={{ color: "var(--muted)", fontSize: 10 }}>#{c.market_cap_rank}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
