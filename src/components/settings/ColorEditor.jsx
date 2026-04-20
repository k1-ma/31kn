import React, { useState } from "react";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import {
  COLOR_CATEGORIES, COLOR_KEYS, contrastRatio, normalizeHex, ensureReadable,
  generateDarkFromLight,
} from "@/lib/theme.js";
import ColorPicker from "@/components/ui/ColorPicker.jsx";
import Button from "@/components/ui/Button.jsx";
import ThemeLivePreview from "./ThemeLivePreview.jsx";

function ContrastBadge({ color, bg, t }) {
  if (!color || !bg) return null;
  const cr = contrastRatio(normalizeHex(color), normalizeHex(bg));
  const level = cr >= 4.5 ? "ok" : cr >= 3 ? "warning" : "fail";
  const cls =
    level === "ok" ? "text-emerald-600 dark:text-emerald-400"
      : level === "warning" ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";
  const icon = level === "ok" ? "✓" : level === "warning" ? "⚠" : "✗";
  return (
    <span className={"text-[9px] font-semibold " + cls} title={`${cr.toFixed(1)}:1`}>
      {icon} {cr.toFixed(1)}:1
    </span>
  );
}

export default function ColorEditor({ colors, colorsDark, presetLight, presetDark, onChange, theme }) {
  const { t } = useI18n();
  const [mode, setMode] = useState(theme === "dark" ? "dark" : "light");
  const palette = mode === "dark" ? (colorsDark || {}) : (colors || {});
  const presetPal = mode === "dark" ? (presetDark || {}) : (presetLight || {});
  const bgColor = palette.bg || presetPal.bg || "#FFFFFF";

  const handleColorChange = (key, hex) => {
    const newPal = { ...palette, [key]: hex };
    onChange?.(mode, newPal);
  };

  const resetKey = (key) => {
    if (presetPal[key]) {
      handleColorChange(key, presetPal[key]);
    }
  };

  const handleAutoFix = () => {
    const fixed = ensureReadable({ ...palette });
    onChange?.(mode, fixed);
  };

  const handleGenerateDark = () => {
    const lightPal = colors || {};
    const darkPal = generateDarkFromLight(lightPal);
    onChange?.("dark", darkPal);
  };

  const categories = [
    { key: "base", icon: "🖼️" },
    { key: "accents", icon: "🎯" },
    { key: "semantic", icon: "📊", hint: t("settings.themeStudio.semanticHint") },
    { key: "onColors", icon: "🔤" },
    { key: "charts", icon: "📈" },
  ];

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* Editor panel */}
      <div className="flex-1 space-y-4 min-w-0">
        {/* Mode toggle + actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setMode("light")}
            className={"px-3 py-1.5 rounded-lg text-xs font-semibold transition-all " +
              (mode === "light" ? "bg-accent text-on-accent" : "bg-muted/30 text-muted-foreground hover:bg-muted/60")}
          >
            ☀️ {t("settings.themeStudio.lightPalette")}
          </button>
          <button
            onClick={() => setMode("dark")}
            className={"px-3 py-1.5 rounded-lg text-xs font-semibold transition-all " +
              (mode === "dark" ? "bg-accent text-on-accent" : "bg-muted/30 text-muted-foreground hover:bg-muted/60")}
          >
            🌙 {t("settings.themeStudio.darkPalette")}
          </button>
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={handleAutoFix}>
            {t("settings.themeStudio.autoFixContrast")}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleGenerateDark}>
            {t("settings.themeStudio.generateDark")}
          </Button>
        </div>

        {/* Color categories */}
        {categories.map(({ key, icon, hint }) => (
          <div key={key} className="space-y-1.5">
            <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <span>{icon}</span>
              {t(`settings.themeStudio.categories.${key}`)}
              {hint && <span className="text-[10px] font-normal text-muted-foreground/60 ml-1">— {hint}</span>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {(COLOR_CATEGORIES[key] || []).map((ck) => (
                <div key={ck} className="flex items-center gap-2 rounded-lg border border-border/30 bg-muted/10 px-2.5 py-1.5">
                  <ColorPicker
                    value={normalizeHex(palette[ck] || presetPal[ck] || "#000000")}
                    onChange={(hex) => handleColorChange(ck, hex)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-semibold truncate">
                      {t(`settings.themeStudio.colorNames.${ck}`)}
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground">
                      {normalizeHex(palette[ck] || presetPal[ck] || "#000000")}
                    </div>
                  </div>
                  <ContrastBadge color={palette[ck] || presetPal[ck]} bg={bgColor} t={t} />
                  <button
                    onClick={() => resetKey(ck)}
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    title={t("settings.themeStudio.resetToDefault")}
                  >
                    ↺
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Live preview sidebar */}
      <div className="lg:w-52 shrink-0 space-y-2">
        <div className="text-xs font-semibold text-muted-foreground">
          {t("settings.themeStudio.livePreview")}
        </div>
        <ThemeLivePreview palette={palette} className="sticky top-4" />
      </div>
    </div>
  );
}
