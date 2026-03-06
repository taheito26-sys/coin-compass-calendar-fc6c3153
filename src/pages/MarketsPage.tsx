import { useCrypto } from "@/lib/cryptoContext";
import { fmtPx, cryptoPriceOf, CRYPTO_ID_MAP } from "@/lib/cryptoState";

export default function MarketsPage() {
  const { state, setState, refresh, toast } = useCrypto();
  const base = state.base;

  const addWatch = (sym: string) => {
    const s = sym.toUpperCase();
    if (state.watch.includes(s)) return;
    setState(prev => ({ ...prev, watch: [...prev.watch, s] }));
    toast("Added " + s, "good");
  };

  const delWatch = (sym: string) => {
    setState(prev => ({ ...prev, watch: prev.watch.filter(s => s !== sym) }));
  };

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <button className="btn secondary" onClick={() => refresh(true)}>↻ Refresh prices</button>
      </div>
      <div className="panel">
        <div className="panel-head"><div className="panel-title">Watchlist</div></div>
        <div className="panel-body">
          <div className="tableWrap"><table>
            <thead><tr><th>Symbol</th><th>ID</th><th style={{ textAlign: "right" }}>Price</th><th style={{ textAlign: "right" }}>Action</th></tr></thead>
            <tbody>
              {state.watch.length ? state.watch.map(sym => {
                const px = cryptoPriceOf(state, sym);
                const id = CRYPTO_ID_MAP[sym];
                return (
                  <tr key={sym}>
                    <td style={{ fontWeight: 900 }}>{sym}</td>
                    <td>{id ? <span className="pill">{id}</span> : <span className="pill warn">no-id</span>}</td>
                    <td style={{ textAlign: "right" }}>{px === null ? "—" : fmtPx(px) + " " + base}</td>
                    <td style={{ textAlign: "right" }}><button className="btn tiny secondary" onClick={() => delWatch(sym)}>Del</button></td>
                  </tr>
                );
              }) : <tr><td colSpan={4} className="muted">No watchlist yet.</td></tr>}
            </tbody>
          </table></div>
        </div>
      </div>
      <div className="panel" style={{ marginTop: 10 }}>
        <div className="panel-head"><div className="panel-title">Quick Add</div></div>
        <div className="panel-body">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {Object.keys(CRYPTO_ID_MAP).filter(s => !state.watch.includes(s)).slice(0, 20).map(sym => (
              <button key={sym} className="btn tiny secondary" onClick={() => addWatch(sym)}>{sym}</button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
