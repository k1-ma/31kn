import React, { useRef, useState } from "react";
import { LogOut, Globe, Coins, Sun, Moon, Laptop, Upload, Download } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader.jsx";
import { Card } from "@/components/ui/Card.jsx";
import Button from "@/components/ui/Button.jsx";
import { useFinance, active } from "@/lib/finance/store.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { useAuth } from "@/auth/AuthProvider.jsx";
import { SUPPORTED_LANGS } from "@/i18n/translations.js";
import { SUPPORTED_CURRENCIES } from "@/lib/money.js";
import { csvToTransactions } from "@/lib/finance/csv.js";

const THEMES = [
  { id: "light", icon: Sun, key: "settings.themes.light" },
  { id: "dark", icon: Moon, key: "settings.themes.dark" },
  { id: "system", icon: Laptop, key: "settings.themes.system" },
];

function applyTheme(theme) {
  const root = document.documentElement;
  try { localStorage.setItem("koshyk:theme", theme); } catch {}
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
  const { state, setPrefs, upsert } = useFinance();
  const prefs = state.prefs || {};
  const fileInputRef = useRef(null);
  const [importStatus, setImportStatus] = useState(null);

  React.useEffect(() => {
    applyTheme(prefs.theme || "system");
  }, [prefs.theme]);

  const onImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus(null);
    try {
      const text = await file.text();
      const wallets = active(state.wallets);
      const categories = active(state.categories);
      const txns = csvToTransactions(text, { wallets, categories });
      let added = 0;
      for (const tx of txns) {
        if (!tx.walletId) continue;
        upsert("transactions", tx);
        added++;
      }
      setImportStatus({ ok: true, added, skipped: txns.length - added });
    } catch (err) {
      setImportStatus({ ok: false, error: err?.message || "Failed to import" });
    } finally {
      e.target.value = "";
    }
  };

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
          <Download className="w-4 h-4" /> {t("settings.exportCsv")}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={onImportFile}
          className="hidden"
        />
        <Button
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
          className="w-full"
        >
          <Upload className="w-4 h-4" /> {t("settings.importCsv")}
        </Button>
        {importStatus && (
          <div
            className={`text-sm rounded-xl px-3 py-2 ${
              importStatus.ok
                ? "text-emerald-700 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-300"
                : "text-red-700 bg-red-50 dark:bg-red-950 dark:text-red-300"
            }`}
          >
            {importStatus.ok
              ? `+${importStatus.added}${importStatus.skipped ? ` (${importStatus.skipped} skipped)` : ""}`
              : importStatus.error}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <Button variant="danger" className="w-full" onClick={() => logout()}>
          <LogOut className="w-4 h-4" /> {t("nav.logout")}
        </Button>
      </Card>
    </div>
  );
}
