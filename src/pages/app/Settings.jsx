import React, { useEffect, useRef, useState } from "react";
import { LogOut, Globe, Coins, Sun, Moon, Laptop, Upload, Download, Lock, FileJson, AlertTriangle } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader.jsx";
import { Card } from "@/components/ui/Card.jsx";
import Button from "@/components/ui/Button.jsx";
import { useFinance, active } from "@/lib/finance/store.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { useAuth } from "@/auth/AuthProvider.jsx";
import { useToast } from "@/components/common/ToastProvider.jsx";
import { SUPPORTED_LANGS } from "@/i18n/translations.js";
import { SUPPORTED_CURRENCIES } from "@/lib/money.js";
import { csvToTransactions } from "@/lib/finance/csv.js";
import { buildBackup, parseBackup } from "@/lib/finance/backup.js";
import { apiJson } from "@/lib/api.js";
import { applyTheme as applyThemeGlobal } from "@/lib/theme.js";
import Input from "@/components/ui/Input.jsx";
import Select from "@/components/ui/Select.jsx";
import { isPinEnabled, setPin, clearPin } from "@/components/common/PinLock.jsx";
import { useConfirm } from "@/components/common/ConfirmProvider.jsx";

const THEMES = [
  { id: "light", icon: Sun, key: "settings.themes.light" },
  { id: "dark", icon: Moon, key: "settings.themes.dark" },
  { id: "system", icon: Laptop, key: "settings.themes.system" },
];

// Use the centralized lib/theme.js so the OS-listener stays in sync.
const applyTheme = applyThemeGlobal;

export default function Settings() {
  const { t, lang, setLang } = useI18n();
  const { user, logout } = useAuth();
  const { state, setPrefs, upsert, update } = useFinance();
  const toast = useToast();
  const confirm = useConfirm();
  const jsonInputRef = useRef(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const prefs = state.prefs || {};
  const fileInputRef = useRef(null);
  const [importStatus, setImportStatus] = useState(null);
  const [pinOn, setPinOn] = useState(false);
  const [pinDraft, setPinDraft] = useState("");
  const [pinErr, setPinErr] = useState("");
  useEffect(() => { setPinOn(isPinEnabled()); }, []);

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

  const exportJson = () => {
    const data = JSON.stringify(buildBackup(state), null, 2);
    const blob = new Blob([data], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `koshyk-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.push({ kind: "success", title: t("toasts.copied") });
  };

  const onImportJson = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const restored = parseBackup(text);
      const ok = await confirm({
        title: t("settings.importJson"),
        body: t("settings.restoreConfirm"),
        danger: true,
        label: t("common.confirm"),
      });
      if (!ok) return;
      update(restored);
      toast.push({ kind: "success", title: t("toasts.restored") });
    } catch (err) {
      toast.push({ kind: "error", title: err?.message || t("errors.generic") });
    } finally {
      e.target.value = "";
    }
  };

  const onDeleteAccount = async () => {
    setDeletingBusy(true);
    try {
      await apiJson("/api/auth/me", { method: "DELETE" });
      try { localStorage.clear(); } catch {}
      window.location.assign("/");
    } catch (err) {
      toast.push({ kind: "error", title: err?.message || t("errors.generic") });
    } finally {
      setDeletingBusy(false);
    }
  };

  const exportCsv = () => {
    const rows = [["date", "type", "amount", "currency", "wallet", "category", "note", "tags"]];
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
        Array.isArray(tx.tags) ? tx.tags.join("|") : "",
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
    toast.push({ kind: "success", title: t("toasts.saved") });
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
        <Select
          value={prefs.baseCurrency || "UAH"}
          onChange={(v) => setPrefs({ baseCurrency: v })}
          options={SUPPORTED_CURRENCIES.map((c) => ({ value: c, label: c }))}
          title={t("settings.baseCurrency")}
          searchable
        />
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
        <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />
        <Button variant="secondary" onClick={exportJson} className="w-full">
          <FileJson className="w-4 h-4" /> {t("settings.exportJson")}
        </Button>
        <input
          ref={jsonInputRef}
          type="file"
          accept=".json,application/json"
          onChange={onImportJson}
          className="hidden"
        />
        <Button
          variant="secondary"
          onClick={() => jsonInputRef.current?.click()}
          className="w-full"
        >
          <Upload className="w-4 h-4" /> {t("settings.importJson")}
        </Button>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <Lock className="w-4 h-4" /> {t("settings.security")}
        </div>
        {pinOn ? (
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              clearPin();
              setPinOn(false);
              setPinErr("");
              setPinDraft("");
              toast.push({ kind: "success", title: t("toasts.deleted") });
            }}
          >
            {t("common.delete")} PIN
          </Button>
        ) : (
          <>
            <Input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="••••"
              value={pinDraft}
              onChange={(e) => setPinDraft(e.target.value.replace(/[^0-9]/g, ""))}
            />
            {pinErr && <div className="text-sm text-red-600">{pinErr}</div>}
            <Button
              className="w-full"
              onClick={async () => {
                try {
                  await setPin(pinDraft);
                  setPinOn(true);
                  setPinDraft("");
                  setPinErr("");
                  toast.push({ kind: "success", title: t("toasts.saved") });
                } catch (e) {
                  setPinErr(e?.message || t("errors.generic"));
                }
              }}
              disabled={pinDraft.length < 4}
            >
              {t("common.save")} PIN
            </Button>
          </>
        )}
      </Card>

      <Card className="p-5 space-y-3">
        <Button
          variant="secondary"
          className="w-full"
          onClick={async () => {
            const ok = await confirm({
              title: t("nav.logout"),
              body: t("settings.logoutConfirm"),
              label: t("nav.logout"),
            });
            if (ok) logout();
          }}
        >
          <LogOut className="w-4 h-4" /> {t("nav.logout")}
        </Button>
        {!deleteOpen ? (
          <Button
            variant="ghost"
            className="w-full text-red-600 hover:text-red-700"
            onClick={() => setDeleteOpen(true)}
          >
            <AlertTriangle className="w-4 h-4" />
            {t("settings.deleteAccount")}
          </Button>
        ) : (
          <div className="rounded-2xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 p-4 space-y-3">
            <div className="text-sm font-semibold text-red-800 dark:text-red-200">
              {t("settings.deleteAccount")}
            </div>
            <p className="text-sm text-red-700 dark:text-red-300">
              {t("settings.deleteConfirm")}
            </p>
            <Input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
            />
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  setDeleteOpen(false);
                  setDeleteConfirm("");
                }}
              >
                {t("common.cancel")}
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                disabled={deleteConfirm !== "DELETE" || deletingBusy}
                onClick={onDeleteAccount}
              >
                {deletingBusy ? t("common.loading") : t("common.confirm")}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
