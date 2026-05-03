import React, { createContext, useContext, useMemo } from "react";
import { TRANSLATIONS } from "./translations";

const I18nCtx = createContext({
  lang: "ru",
  setLang: () => {},
  t: (k) => k,
  plural: (count) => String(count),
});

// Map a count to a CLDR plural category for the supported languages.
// Russian/Ukrainian use the Slavic 1/few/many rules; English (and others)
// fall back to the binary one/other rule.
function pluralCategory(lang, count) {
  const n = Math.abs(Number(count) || 0);
  if (lang === "ru" || lang === "uk") {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return "one";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "few";
    return "many";
  }
  return n === 1 ? "one" : "other";
}

// plural(count, forms): pick the right form for the active language.
// `forms` accepts CLDR keys, plus convenience aliases:
//   - { one, few, many, other }  (Slavic)
//   - { one, other }             (binary)
//   - [singular, plural]         (English-style positional fallback)
function pickPluralForm(lang, count, forms) {
  if (Array.isArray(forms)) {
    return forms[Math.abs(count) === 1 ? 0 : 1] ?? forms[forms.length - 1] ?? "";
  }
  if (!forms || typeof forms !== "object") return "";
  const cat = pluralCategory(lang, count);
  if (forms[cat] != null) return forms[cat];
  // Fallbacks: many → other → one
  return forms.other ?? forms.many ?? forms.one ?? "";
}

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

    // tPlural(key, count, vars?) — read a translation entry that is itself
    // an object of CLDR plural forms ({ one, few, many, other } or
    // { one, other }) and pick the right form for the active language.
    // Falls back through dict → fallback dict; passes {count} into vars
    // automatically so callers don't have to.
    const tPlural = (key, count, vars = null) => {
      const entry = get(dict, key) ?? get(fallback, key);
      const merged = { ...(vars || {}), count };
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        const form = pickPluralForm(effectiveLang, Number(count) || 0, entry);
        return String(form).replace(/\{(\w+)\}/g, (_, k) => (merged[k] ?? `{${k}}`));
      }
      // Entry is a plain string with {count} placeholder — fall back to t().
      return t(key, merged);
    };

    const plural = (count, forms) =>
      String(pickPluralForm(effectiveLang, Number(count) || 0, forms))
        .replace(/\{count\}/g, String(count))
        .replace(/\{n\}/g, String(count));
    return { lang: effectiveLang, setLang, t, tPlural, plural };
  }, [lang, setLang]);

  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n() {
  return useContext(I18nCtx);
}
