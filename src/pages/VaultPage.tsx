import { useState, useEffect, useCallback, useRef } from "react";
import { useCrypto } from "@/lib/cryptoContext";

interface Snapshot {
  id: string;
  label: string;
  ts: number;
  size: number;
}

const DB_NAME = "cryptotracker_vault";
const STORE = "snapshots";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSave(id: string, state: any, label: string) {
  const db = await openDB();
  const blob = JSON.stringify(state);
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ id, label, ts: Date.now(), state, size: blob.length });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbList(): Promise<Snapshot[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const items = (req.result || []).map((s: any) => ({ id: s.id, label: s.label, ts: s.ts, size: s.size || 0 }));
      items.sort((a: Snapshot, b: Snapshot) => b.ts - a.ts);
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(id: string): Promise<any> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbDelete(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtSize(bytes: number) {
  if (bytes > 1048576) return (bytes / 1048576).toFixed(1) + " MB";
  if (bytes > 1024) return (bytes / 1024).toFixed(1) + " KB";
  return bytes + " B";
}

export default function VaultPage() {
  const { state, setState, toast } = useCrypto();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [desc, setDesc] = useState("");
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadSnaps = useCallback(async () => {
    try {
      const list = await idbList();
      setSnapshots(list);
    } catch { }
    setLoading(false);
  }, []);

  useEffect(() => { loadSnaps(); }, [loadSnaps]);

  const takeSnapshot = async () => {
    if (!desc.trim()) { toast("Add a description for the snapshot", "warn"); return; }
    try {
      await idbSave("snap_" + Date.now(), state, desc.trim());
      setDesc("");
      toast("📸 Snapshot saved", "good");
      loadSnaps();
    } catch { toast("Failed to save snapshot", "bad"); }
  };

  const restoreSnap = async (id: string) => {
    if (!confirm("Restore this snapshot? Current data will be overwritten.")) return;
    try {
      const snap = await idbGet(id);
      if (snap?.state) { setState(() => snap.state); toast("✓ Restored from snapshot", "good"); }
      else toast("Snapshot not found", "bad");
    } catch { toast("Restore failed", "bad"); }
  };

  const deleteSnap = async (id: string) => {
    if (!confirm("Delete this snapshot?")) return;
    await idbDelete(id);
    toast("Snapshot deleted", "warn");
    loadSnaps();
  };

  const exportSnap = async (id: string) => {
    const snap = await idbGet(id);
    if (!snap?.state) { toast("Not found", "bad"); return; }
    const blob = new Blob([JSON.stringify(snap.state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `snapshot-${new Date(snap.ts).toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    a.click(); URL.revokeObjectURL(a.href);
    toast("Exported snapshot", "good");
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "crypto-backup.json"; a.click();
    toast("📥 Exported JSON", "good");
  };

  const importJSON = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      setState(() => data);
      toast("✓ Restored from file", "good");
    } catch { toast("Invalid backup file", "bad"); }
  };

  const clearAll = () => {
    if (confirm("Clear ALL transactions, lots, and holdings? This cannot be undone.")) {
      setState(p => ({ ...p, txs: [], lots: [], holdings: [], importedFiles: [], calendarEntries: [] }));
      toast("All data cleared", "bad");
    }
  };

  return (
    <>
      {/* Top row: Snapshots + Export/Import side by side on desktop */}
      <div className="vault-top-grid">
        {/* Local Snapshots */}
        <div className="panel">
          <div className="panel-head">
            <h2>💾 Local Snapshots</h2>
            <span className="pill">{snapshots.length} saved</span>
          </div>
          <div className="panel-body">
            <p className="muted" style={{ fontSize: 11, marginBottom: 10, lineHeight: 1.6 }}>
              Instant local snapshots stored in IndexedDB. Survives page reloads.
            </p>
            <div className="vault-snap-input">
              <input className="input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Snapshot description" style={{ flex: 1, minWidth: 0 }} />
              <button className="btn" onClick={takeSnapshot}>📸 Snapshot</button>
            </div>
            {loading && <div className="muted" style={{ fontSize: 11 }}>Loading snapshots…</div>}
            {!loading && snapshots.length === 0 && <div className="muted" style={{ fontSize: 11, padding: "12px 0" }}>No snapshots yet. Take your first snapshot above.</div>}

            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {snapshots.map(s => (
                <div key={s.id} className="vault-card">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 12 }}>{s.label}</div>
                    <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>{fmtDate(s.ts)} · {fmtSize(s.size)}</div>
                  </div>
                  <div className="vault-card-actions">
                    <button className="rowBtn" onClick={() => restoreSnap(s.id)}>Restore</button>
                    <button className="rowBtn" onClick={() => exportSnap(s.id)}>Export</button>
                    <button className="rowBtn" onClick={() => deleteSnap(s.id)} style={{ color: "var(--bad)" }}>Del</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Data Export & Import */}
        <div className="panel">
          <div className="panel-head">
            <h2>📦 Export & Import</h2>
            <span className="pill">JSON</span>
          </div>
          <div className="panel-body">
            <p className="muted" style={{ fontSize: 11, marginBottom: 10 }}>Export your data for offline backup or transfer between devices.</p>
            <div className="vault-actions-grid">
              <button className="btn secondary" onClick={exportJSON}>📄 Export JSON</button>
              <label className="btn secondary" style={{ cursor: "pointer" }}>
                📂 Import JSON
                <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) importJSON(f); }} />
              </label>
            </div>
            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 10 }}>
              <button className="btn danger" onClick={clearAll}>⚠ Clear All Data</button>
            </div>
          </div>
        </div>
      </div>

      {/* Data Stats */}
      <div className="panel" style={{ marginTop: 10 }}>
        <div className="panel-head"><h2>📊 Data Stats</h2></div>
        <div className="panel-body">
          <div className="vault-stats">
            <div className="cal-stat"><div className="kpi-lbl">Transactions</div><div className="kpi-val">{state.txs.length}</div></div>
            <div className="cal-stat"><div className="kpi-lbl">Lots</div><div className="kpi-val">{state.lots.length}</div></div>
            <div className="cal-stat"><div className="kpi-lbl">Holdings</div><div className="kpi-val">{state.holdings.length}</div></div>
            <div className="cal-stat"><div className="kpi-lbl">Imports</div><div className="kpi-val">{(state.importedFiles || []).length}</div></div>
          </div>
        </div>
      </div>
    </>
  );
}
