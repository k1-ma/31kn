import React from "react";
import { LogOut, Globe, Coins, Sun, Moon, Laptop } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader.jsx";
import { Card } from "@/components/ui/Card.jsx";
import Button from "@/components/ui/Button.jsx";
import { useFinance } from "@/lib/finance/store.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { useAuth } from "@/auth/AuthProvider.jsx";
import { SUPPORTED_LANGS } from "@/i18n/translations.js";
import { SUPPORTED_CURRENCIES } from "@/lib/money.js";

const THEMES = [
  { id: "light", icon: Sun, key: "settings.themes.light" },
  { id: "dark", icon: Moon, key: "settings.themes.dark" },
  { id: "system", icon: Laptop, key: "settings.themes.system" },
];

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else if (theme === "light") root.classList.remove("dark");
  else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", prefersDark);
  }
}

export default function Settings() {
  const { t, lang, setLang } = useI18n();
  const { user, logout } = useAuth();
  const { state, setPrefs } = useFinance();
  const prefs = state.prefs || {};

  React.useEffect(() => {
    applyTheme(prefs.theme || "system");
  }, [prefs.theme]);

  const exportCsv = () => {
    const rows = [["date", "type", "amount", "currency", "wallet", "category", "note"]];
    const wals = new Map(state.wallets.map((w) => [w.id, w.name]));
    const cats = new Map(state.categories.map((c) => [c.id, c.name]));
    for (const tx of state.transactions) {
      if (tx.deletedAt) continue;
      rows.push([
        tx.date,
        tx.type,
        ((tx.amount_cents || 0) / 100).toFixed(2),
        tx.currency,
        wals.get(tx.walletId) || "",
        cats.get(tx.categoryId) || "",
        (tx.note || "").replace(/[\r\n]/g, " "),
      ]);
    }
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `koshyk-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="page-enter space-y-5">
      <PageHeader title={t("nav.settings")} subtitle={user?.email || ""} />

      <Card className="p-5 space-y-3">
        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {t("settings.appearance")}
        </div>
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
            <Globe className="w-4 h-4" /> {t("settings.language")}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {SUPPORTED_LANGS.map((l) => (
              <button
                key={l.id}
                onClick={() => setLang(l.id)}
                className={`h-11 rounded-xl border text-sm font-medium ${
                  lang === l.id
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                    : "border-slate-200 dark:border-slate-700"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-sm text-slate-500 mb-2">{t("settings.theme")}</div>
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map(({ id, icon: Icon, key }) => (
              <button
                key={id}
                onClick={() => setPrefs({ theme: id })}
                className={`h-11 rounded-xl border text-sm flex items-center justify-center gap-2 ${
                  prefs.theme === id
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                    : "border-slate-200 dark:border-slate-700"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t(key)}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <Coins className="w-4 h-4" /> {t("settings.baseCurrency")}
        </div>
        <select
          value={prefs.baseCurrency || "UAH"}
          onChange={(e) => setPrefs({ baseCurrency: e.target.value })}
          className="h-12 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3"
        >
          {SUPPORTED_CURRENCIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {t("settings.data")}
        </div>
        <Button variant="secondary" onClick={exportCsv} className="w-full">
          {t("settings.exportCsv")}
        </Button>
      </Card>

      <Card className="p-5">
        <Button variant="danger" className="w-full" onClick={() => logout()}>
          <LogOut className="w-4 h-4" /> {t("nav.logout")}
        </Button>
      </Card>
    </div>
  );
}
