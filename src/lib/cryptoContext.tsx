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
    // Let the CSS layout font take effect by not overriding --app-font
    // unless the layout doesn't set --lt-font
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

  // Skip auto refresh on mount — useLivePrices handles polling
  // This avoids duplicate CoinGecko calls causing 429s

  return (
    <Ctx.Provider value={{ state, setState, refresh, toast, toastMsg }}>
      {children}
    </Ctx.Provider>
  );
});

CryptoProvider.displayName = "CryptoProvider";

