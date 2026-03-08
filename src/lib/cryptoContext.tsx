import React, { createContext, useContext, useState, useCallback, useEffect, useRef, forwardRef } from "react";
import { useAuth } from "@clerk/react";
import { CryptoState, loadState, saveState, defaultState, refreshPrices } from "./cryptoState";
import {
  fetchImportedFiles,
  fetchTransactions,
  fetchUserPreferences,
  saveUserPreferences,
  isWorkerConfigured,
  setAuthTokenProvider,
} from "@/lib/api";
import { getAssetCatalog, resolveAssetSymbol } from "@/lib/assetResolver";
import { runMigration } from "@/lib/migration";

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

/** Keys that should be synced to backend user_preferences */
const SYNCABLE_PREF_KEYS = ["base", "method", "layout", "theme"] as const;

export const CryptoProvider = forwardRef<HTMLDivElement, { children: React.ReactNode }>(function CryptoProvider({ children }, _ref) {
  const [state, setStateRaw] = useState<CryptoState>(loadState);
  const [toastMsg, setToast] = useState<{ msg: string; type: string } | null>(null);
  const hydratedRef = useRef(false);
  const authWiredRef = useRef(false);

  // Wire Clerk auth token provider
  let clerkAuth: ReturnType<typeof useAuth> | null = null;
  try {
    clerkAuth = useAuth();
  } catch {
    // If Clerk not available, auth wiring is skipped
  }

  // Set up auth token provider whenever Clerk state changes
  useEffect(() => {
    if (!clerkAuth) return;
    const { isSignedIn, getToken } = clerkAuth;

    setAuthTokenProvider(async () => {
      if (!isSignedIn) return null;
      try {
        return await getToken();
      } catch {
        return null;
      }
    });
    authWiredRef.current = true;
  }, [clerkAuth?.isSignedIn, clerkAuth?.getToken]);

  const setState = useCallback((updater: (prev: CryptoState) => CryptoState) => {
    setStateRaw((prev) => {
      const next = updater(prev);
      // Only save UI preferences to localStorage
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

  /**
   * Backend-first data hydration.
   * On authentication, fetch all business data from D1 (the canonical source of truth).
   * Also handles one-time migration from legacy localStorage data.
   */
  useEffect(() => {
    if (hydratedRef.current) return;
    if (!isWorkerConfigured()) return;
    if (!clerkAuth?.isSignedIn) return;
    if (!authWiredRef.current) return;

    hydratedRef.current = true;

    let cancelled = false;

    (async () => {
      // Update sync status
      setStateRaw((prev) => ({ ...prev, syncStatus: "loading" as const }));

      try {
        // Fetch all canonical data from backend in parallel
        const [assets, transactions, importedFiles, userPrefs] = await Promise.all([
          getAssetCatalog(true),
          fetchTransactions(),
          fetchImportedFiles().catch(() => []),
          fetchUserPreferences().catch(() => ({} as Record<string, string>)),
        ]);

        if (cancelled) return;

        // Map backend transactions to CryptoTx format
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

        // Apply backend preferences (override localStorage values)
        const prefUpdates: Partial<CryptoState> = {};
        if (userPrefs.base) prefUpdates.base = userPrefs.base;
        if (userPrefs.method) prefUpdates.method = userPrefs.method;
        if (userPrefs.layout) prefUpdates.layout = userPrefs.layout;
        if (userPrefs.theme) prefUpdates.theme = userPrefs.theme;

        setStateRaw((prev) => {
          const next = {
            ...prev,
            ...prefUpdates,
            txs: canonicalTxs,
            importedFiles: canonicalImported,
            syncStatus: "synced" as const,
            syncError: undefined,
          };
          saveState(next); // saves UI prefs only
          return next;
        });

        // If backend has no transactions but localStorage has legacy data, run migration
        if (canonicalTxs.length === 0) {
          const migrationResult = await runMigration();
          if (migrationResult?.migrated && migrationResult.txsMigrated > 0) {
            // Re-fetch after migration
            const newTxs = await fetchTransactions();
            const newCanonical = newTxs
              .map((tx) => {
                const asset = assetById.get(tx.asset_id);
                const symbol = resolveAssetSymbol(asset?.symbol || asset?.binance_symbol || "");
                if (!symbol) return null;
                const ts = Date.parse(tx.timestamp);
                if (!Number.isFinite(ts)) return null;
                const qty = Number(tx.qty || 0);
                const price = Number(tx.unit_price || 0);
                return {
                  id: tx.id, ts, type: tx.type, asset: symbol, qty, price,
                  total: qty * price, fee: Number(tx.fee_amount || 0),
                  feeAsset: tx.fee_currency || "USD", accountId: "acc_main",
                  note: tx.note || "", lots: "",
                };
              })
              .filter((tx): tx is NonNullable<typeof tx> => tx !== null);

            if (!cancelled) {
              setStateRaw((prev) => ({
                ...prev,
                txs: newCanonical,
                syncStatus: "synced" as const,
              }));
            }

            console.info(`[migration] Migrated ${migrationResult.txsMigrated} txs, ${migrationResult.filesMigrated} files`);
            if (migrationResult.errors.length > 0) {
              console.warn("[migration] Errors:", migrationResult.errors);
            }
          }
        }
      } catch (err) {
        console.error("[crypto-context] Backend hydration failed:", err);
        if (!cancelled) {
          setStateRaw((prev) => ({
            ...prev,
            syncStatus: "error" as const,
            syncError: err instanceof Error ? err.message : "Backend unreachable",
          }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clerkAuth?.isSignedIn, clerkAuth?.getToken]);

  // Sync preferences to backend when they change
  const prevPrefsRef = useRef<string>("");
  useEffect(() => {
    if (!clerkAuth?.isSignedIn || !isWorkerConfigured()) return;
    if (state.syncStatus !== "synced") return; // Don't sync until initial hydration is done

    const currentPrefs = JSON.stringify({
      base: state.base,
      method: state.method,
      layout: state.layout,
      theme: state.theme,
    });

    if (prevPrefsRef.current === currentPrefs) return;
    if (prevPrefsRef.current === "") {
      // First render after hydration, just record current state
      prevPrefsRef.current = currentPrefs;
      return;
    }

    prevPrefsRef.current = currentPrefs;

    // Debounced save to backend
    const timer = setTimeout(() => {
      saveUserPreferences({
        base: state.base,
        method: state.method,
        layout: state.layout,
        theme: state.theme,
      }).catch((err) => {
        console.warn("[crypto-context] Failed to sync preferences:", err);
      });
    }, 1000);

    return () => clearTimeout(timer);
  }, [state.base, state.method, state.layout, state.theme, state.syncStatus, clerkAuth?.isSignedIn]);

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
