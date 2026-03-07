import React, { createContext, useContext, useState, useCallback, useEffect, forwardRef } from "react";
import { CryptoState, loadState, saveState, defaultState, refreshPrices } from "./cryptoState";

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

  const setState = useCallback((updater: (prev: CryptoState) => CryptoState) => {
    setStateRaw(prev => {
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

  // Apply layout/theme to body
  useEffect(() => {
    document.body.setAttribute("data-layout", state.layout);
    document.body.setAttribute("data-theme", state.theme);
    document.documentElement.style.setProperty("--app-font", `'Inter', sans-serif`);
  }, [state.layout, state.theme]);

  // Auto refresh on mount
  useEffect(() => {
    refresh().catch(() => {});
    // eslint-disable-next-line
  }, []);

  return (
    <Ctx.Provider value={{ state, setState, refresh, toast, toastMsg }}>
      {children}
    </Ctx.Provider>
  );
});

CryptoProvider.displayName = "CryptoProvider";

