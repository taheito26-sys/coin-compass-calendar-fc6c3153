import { useState, useRef, useEffect } from "react";

interface AssetFilterProps {
  allSymbols: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}

export function AssetFilter({ allSymbols, selected, onChange }: AssetFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = allSymbols.filter(s => s.toLowerCase().includes(search.toLowerCase()));
  const label = selected.size === 0
    ? "All Assets"
    : selected.size <= 3
      ? [...selected].join(", ")
      : `${selected.size} assets`;

  const toggle = (sym: string) => {
    const next = new Set(selected);
    next.has(sym) ? next.delete(sym) : next.add(sym);
    onChange(next);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        className="btn secondary"
        onClick={() => setOpen(!open)}
        style={{ padding: "6px 10px", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}
      >
        <span>🔍</span> {label}
        {selected.size > 0 && (
          <span
            onClick={e => { e.stopPropagation(); onChange(new Set()); }}
            style={{ marginLeft: 4, cursor: "pointer", opacity: 0.6 }}
            title="Clear filter"
          >✕</span>
        )}
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, zIndex: 50, marginTop: 4,
          background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8,
          padding: 8, minWidth: 200, maxHeight: 280, overflow: "auto",
          boxShadow: "0 8px 24px rgba(0,0,0,.4)",
        }}>
          <input
            type="text"
            placeholder="Search assets…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: "100%", padding: "6px 8px", fontSize: 11, marginBottom: 6,
              background: "var(--panel2)", border: "1px solid var(--line)", borderRadius: 6,
              color: "var(--fg)", outline: "none",
            }}
          />
          {filtered.map(sym => (
            <label
              key={sym}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "4px 6px",
                fontSize: 11, cursor: "pointer", borderRadius: 4,
                background: selected.has(sym) ? "var(--brand3)" : "transparent",
                fontWeight: selected.has(sym) ? 700 : 400,
                color: selected.has(sym) ? "var(--brand)" : "var(--fg)",
              }}
            >
              <input
                type="checkbox"
                checked={selected.has(sym)}
                onChange={() => toggle(sym)}
                style={{ accentColor: "var(--brand)" }}
              />
              <span className="mono">{sym}</span>
            </label>
          ))}
          {filtered.length === 0 && <div style={{ fontSize: 11, color: "var(--muted)", padding: 4 }}>No matches</div>}
        </div>
      )}
    </div>
  );
}
