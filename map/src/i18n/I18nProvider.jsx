import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getLocale, setLocale as setLocaleCore, subscribeLocale, t } from "./i18n.js";
import { refreshModeHint } from "../map/modeBundle.js";

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [tick, setTick] = useState(0);

  useEffect(() => subscribeLocale(() => setTick((n) => n + 1)), []);

  const setLocale = useCallback((next) => {
    setLocaleCore(next);
    refreshModeHint();
  }, []);

  const value = useMemo(
    () => ({
      locale: getLocale(),
      setLocale,
      t,
    }),
    [tick, setLocale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
