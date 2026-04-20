import React, { createContext, useContext, useMemo } from "react";
import { TRANSLATIONS } from "./translations";

const I18nCtx = createContext({ lang: "ru", setLang: () => {}, t: (k) => k });

function get(obj, path) {
  const parts = String(path || "").split(".").filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

export default function I18nProvider({ lang, setLang, children }) {
  const value = useMemo(() => {
    // Normalize lang: "default" is no longer supported, fallback to "ru"
    const effectiveLang = lang === "default" || !lang ? "ru" : lang;
    const dict = TRANSLATIONS[effectiveLang] || TRANSLATIONS.ru;
    const fallback = TRANSLATIONS.ru;
    const t = (key, vars = null, fallbackText = "") => {
      const dictVal = get(dict, key);
      const fallbackVal = get(fallback, key);
      // If key is not found in both dict and fallback, use fallbackText or empty string
      let val = dictVal ?? fallbackVal ?? (fallbackText || "");
      // If value is an object with a .label property, extract it
      if (val && typeof val === "object" && typeof val.label === "string") val = val.label;
      // Safety guard: if val is still an object/array, return the fallbackText to avoid React error #31
      if (val && typeof val === "object") {
        console.warn(`[i18n] Translation key "${key}" returned an object. Use a more specific key.`);
        return fallbackText || "";
      }
      if (!vars) return val;
      return String(val).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
    };
    return { lang: effectiveLang, setLang, t };
  }, [lang, setLang]);

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n() {
  return useContext(I18nCtx);
}
