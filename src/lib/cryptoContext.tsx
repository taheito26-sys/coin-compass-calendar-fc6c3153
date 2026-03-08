import React, { createContext, useContext, useState, useCallback, useEffect, useRef, forwardRef } from "react";
import { CryptoState, loadState, saveState, defaultState, refreshPrices } from "./cryptoState";
import { fetchImportedFiles, fetchTransactions, isWorkerConfigured } from "@/lib/api";
import { getAssetCatalog, resolveAssetSymbol } from "@/lib/assetResolver";

interface CryptoCtx {
  state: CryptoState;
  setState: (updater: (prev: CryptoState) => CryptoState) => void;
  refresh: (force?: boolean) => Promise<void>;
  toast: (msg: string, type?: string) => void;
  toastMsg: { msg: string; type: string } | null;
}

const fallbackCtx: CryptoCtx = {
  state: defaultState(),
  setState: () => {},
  refresh: async () => {},
  toast: () => {},
  toastMsg: null,
};

const Ctx = createContext<CryptoCtx>(fallbackCtx);
export const useCrypto = () => useContext(Ctx);

export const CryptoProvider = forwardRef<HTMLDivElement, { children: React.ReactNode }>(function CryptoProvider({ children }, _ref) {
  const [state, setStateRaw] = useState<CryptoState>(loadState);
  const [toastMsg, setToast] = useState<{ msg: string; type: string } | null>(null);
  const hydratedRef = useRef(false);

  const setState = useCallback((updater: (prev: CryptoState) => CryptoState) => {
    setStateRaw((prev) => {
      const next = updater(prev);
      saveState(next);
      return next;
    });
  }, []);

  const refresh = useCallback(async (force = false) => {
    try {
      const updated = await refreshPrices(state, force);
      setState(() => updated);
      setToast({ msg: "Prices updated", type: "good" });
    } catch (e: any) {
      setToast({ msg: "Price refresh failed: " + (e.message || e), type: "bad" });
    }
  }, [state, setState]);

  const toast = useCallback((msg: string, type = "") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Hydrate canonical tx list from backend so tx IDs stay reconciled across reloads.
  useEffect(() => {
    if (hydratedRef.current || !isWorkerConfigured()) return;
    hydratedRef.current = true;

    let cancelled = false;

    (async () => {
      try {
        const [assets, transactions, importedFiles] = await Promise.all([
          getAssetCatalog(),
          fetchTransactions(),
          fetchImportedFiles().catch(() => []),
        ]);

        if (cancelled) return;

        const assetById = new Map(assets.map((a) => [a.id, a]));
        const canonicalTxs = transactions
          .map((tx) => {
            const asset = assetById.get(tx.asset_id);
            const symbol = resolveAssetSymbol(asset?.symbol || asset?.binance_symbol || "");
            if (!symbol) return null;

            const ts = Date.parse(tx.timestamp);
            if (!Number.isFinite(ts)) return null;

            const qty = Number(tx.qty || 0);
            const price = Number(tx.unit_price || 0);
            const fee = Number(tx.fee_amount || 0);

            return {
              id: tx.id,
              ts,
              type: tx.type,
              asset: symbol,
              qty,
              price,
              total: qty * price,
              fee,
              feeAsset: tx.fee_currency || "USD",
              accountId: "acc_main",
              note: tx.note || "",
              lots: "",
            };
          })
          .filter((tx): tx is NonNullable<typeof tx> => tx !== null);

        const canonicalImported = importedFiles.map((file: any) => ({
          name: file.file_name,
          hash: file.file_hash,
          importedAt: file.imported_at ? Date.parse(file.imported_at) : Date.now(),
          exchange: file.exchange,
          exportType: file.export_type,
          rowCount: Number(file.row_count || 0),
        }));

        setStateRaw((prev) => {
          const next = {
            ...prev,
            txs: canonicalTxs,
            importedFiles: canonicalImported,
          };
          saveState(next);
          return next;
        });
      } catch (err) {
        console.warn("[crypto-context] backend hydration skipped:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Apply layout/theme to body
  useEffect(() => {
    document.body.setAttribute("data-layout", state.layout);
    document.body.setAttribute("data-theme", state.theme);
    const layoutFonts: Record<string, string> = {
      flux: "'Inter', sans-serif",
      cipher: "'JetBrains Mono', monospace",
      vector: "'Plus Jakarta Sans', sans-serif",
      aurora: "'Plus Jakarta Sans', sans-serif",
      carbon: "'JetBrains Mono', monospace",
      prism: "'Space Grotesk', sans-serif",
      noir: "'Inter', sans-serif",
      pulse: "'DM Sans', 'Inter', sans-serif",
    };
    document.documentElement.style.setProperty("--app-font", layoutFonts[state.layout] || "'Inter', sans-serif");
  }, [state.layout, state.theme]);

  return (
    <Ctx.Provider value={{ state, setState, refresh, toast, toastMsg }}>
      {children}
    </Ctx.Provider>
  );
});

CryptoProvider.displayName = "CryptoProvider";
