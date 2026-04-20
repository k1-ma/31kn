import React, { useState, useMemo } from "react";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { THEME_PRESETS, mergePresets, normalizeHex } from "@/lib/theme.js";
import { THEME_PRESETS as DESIGN_PRESETS } from "@/lib/themePresets.js";
import Badge from "@/components/ui/Badge.jsx";
import ThemeLivePreview from "./ThemeLivePreview.jsx";

const FILTERS = ["all", "light", "dark", "bright"];

function getFilterKey(f) {
  const map = { all: "filterAll", light: "filterLight", dark: "filterDark", bright: "filterBright" };
  return map[f] || f;
}

function isBrightPalette(light) {
  if (!light?.accent) return false;
  const hex = normalizeHex(light.accent).slice(1);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (r + g + b) / 3 > 140;
}

export default function ThemePresetGrid({ activePresetId, customPresets = [], onSelect }) {
  const { t, lang } = useI18n();
  const [filter, setFilter] = useState("all");

  const allPresets = useMemo(
    () => mergePresets(THEME_PRESETS, DESIGN_PRESETS).concat(
      (customPresets || []).filter(Boolean).map((cp) => ({
        id: cp.id,
        name: typeof cp.name === "string" ? { en: cp.name, ru: cp.name, uk: cp.name } : cp.name || { en: "Custom", ru: "Свой", uk: "Свій" },
        kind: "custom",
        light: cp.light || {},
        dark: cp.dark || {},
      }))
    ),
    [customPresets]
  );

  const filtered = useMemo(() => {
    if (filter === "all") return allPresets;
    return allPresets.filter((p) => {
      if (filter === "light") {
        const bg = normalizeHex(p.light?.bg || "#FFFFFF").slice(1);
        const lum = parseInt(bg.slice(0, 2), 16);
        return lum > 200;
      }
      if (filter === "dark") {
        const bg = normalizeHex(p.dark?.bg || "#000000").slice(1);
        const lum = parseInt(bg.slice(0, 2), 16);
        return lum < 30;
      }
      if (filter === "bright") return isBrightPalette(p.light);
      return true;
    });
  }, [filter, allPresets]);

  const kinds = ["pro", "clean", "fun", "custom"];

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all " +
              (filter === f
                ? "bg-accent text-on-accent"
                : "bg-muted/30 text-muted-foreground hover:bg-muted/60")
            }
          >
            {t(`settings.themeStudio.${getFilterKey(f)}`)}
          </button>
        ))}
      </div>

      {/* Grouped by kind */}
      {kinds.map((kind) => {
        const items = filtered.filter((p) => p.kind === kind);
        if (!items.length) return null;
        return (
          <div key={kind} className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t(`settings.themeStudio.presetKinds.${kind}`)}
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
              {items.map((preset) => {
                const isActive = preset.id === activePresetId;
                const name = (preset.name && typeof preset.name === "object") ? (preset.name[lang] || preset.name.en || preset.id) : (preset.name || preset.id);
                return (
                  <button
                    key={preset.id}
                    onClick={() => onSelect?.(preset)}
                    className={
                      "relative rounded-xl border transition-all text-left p-0 overflow-hidden hover-lift focus-visible:ring-2 focus-visible:ring-accent/40 " +
                      (isActive
                        ? "ring-2 ring-accent border-accent/50"
                        : "border-border/40 hover:border-accent/30")
                    }
                  >
                    <ThemeLivePreview palette={preset.light} className="pointer-events-none border-0 rounded-none" />
                    <div className="px-2.5 py-2 flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold truncate">{name}</span>
                      {isActive && (
                        <Badge variant="solid" className="text-[9px] px-1.5 py-0">
                          ✓
                        </Badge>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
