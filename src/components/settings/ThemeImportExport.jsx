import React, { useState } from "react";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { exportThemeConfig, importThemeConfig } from "@/lib/theme.js";
import Button from "@/components/ui/Button.jsx";

export default function ThemeImportExport({ ui, onImport }) {
  const { t } = useI18n();
  const [jsonInput, setJsonInput] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const handleExport = () => {
    const json = exportThemeConfig(ui);
    navigator.clipboard?.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleImport = () => {
    setError("");
    try {
      const config = importThemeConfig(jsonInput);
      onImport?.(config);
      setJsonInput("");
    } catch (err) {
      setError(err.message || t("settings.themeStudio.invalidJson"));
    }
  };

  const exportJson = exportThemeConfig(ui);

  return (
    <div className="space-y-6">
      {/* Export */}
      <div className="space-y-2">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          📤 {t("settings.themeStudio.export")}
        </div>
        <div className="rounded-xl border border-border/40 bg-muted/10 p-3">
          <pre className="text-[10px] font-mono text-muted-foreground overflow-auto max-h-40 whitespace-pre-wrap break-all">
            {exportJson}
          </pre>
        </div>
        <Button variant="secondary" size="sm" onClick={handleExport}>
          {copied ? `✓ ${t("settings.themeStudio.copied")}` : `📋 ${t("common.copiedToClipboard").split(".")[0] || "Copy"}`}
        </Button>
      </div>

      {/* Import */}
      <div className="space-y-2">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          📥 {t("settings.themeStudio.import")}
        </div>
        <textarea
          value={jsonInput}
          onChange={(e) => { setJsonInput(e.target.value); setError(""); }}
          placeholder={t("settings.themeStudio.pasteJson")}
          className="w-full h-32 rounded-xl border border-border/50 bg-muted/30 px-3 py-2 text-xs font-mono text-foreground outline-none focus:border-accent/50 resize-none"
          spellCheck={false}
        />
        {error && (
          <div className="text-xs text-red-500 font-semibold">{error}</div>
        )}
        <Button variant="primary" size="sm" onClick={handleImport} disabled={!jsonInput.trim()}>
          {t("settings.themeStudio.import")}
        </Button>
      </div>
    </div>
  );
}
