import React from "react";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { DESIGN_STYLES } from "@/lib/themePresets.js";

/* Mini visual preview showing design style characteristics */
function StylePreview({ styleId }) {
  const base = "w-full rounded-lg overflow-hidden border border-border/20";
  if (styleId === "glass") {
    return (
      <div className={base + " bg-gradient-to-br from-accent/5 to-accent/15 p-2 backdrop-blur-sm"}>
        <div className="h-2 w-10 rounded bg-white/20 mb-1.5" />
        <div className="flex gap-1.5">
          <div className="flex-1 h-7 rounded-md bg-white/10 backdrop-blur border border-white/10" />
          <div className="flex-1 h-7 rounded-md bg-white/10 backdrop-blur border border-white/10" />
        </div>
        <div className="mt-1.5 h-1.5 w-6 rounded bg-accent/30" />
      </div>
    );
  }
  if (styleId === "strict") {
    return (
      <div className={base + " bg-card/80 p-2"}>
        <div className="h-2 w-10 rounded-sm bg-foreground/10 mb-1.5" />
        <div className="flex gap-1.5">
          <div className="flex-1 h-7 rounded-sm bg-muted/40 border border-border/60" />
          <div className="flex-1 h-7 rounded-sm bg-muted/40 border border-border/60" />
        </div>
        <div className="mt-1.5 h-1.5 w-6 rounded-sm bg-accent/40" />
      </div>
    );
  }
  // neo
  return (
    <div className={base + " bg-muted/30 p-2"}>
      <div className="h-2 w-10 rounded-full bg-foreground/8 mb-1.5" />
      <div className="flex gap-1.5">
        <div className="flex-1 h-7 rounded-lg bg-card shadow-[inset_2px_2px_4px_rgba(0,0,0,0.06),inset_-2px_-2px_4px_rgba(255,255,255,0.06)]" />
        <div className="flex-1 h-7 rounded-lg bg-card shadow-[inset_2px_2px_4px_rgba(0,0,0,0.06),inset_-2px_-2px_4px_rgba(255,255,255,0.06)]" />
      </div>
      <div className="mt-1.5 h-1.5 w-6 rounded-full bg-accent/30" />
    </div>
  );
}

export default function DesignStylePicker({ activeStyle = "glass", onSelect }) {
  const { t, lang } = useI18n();

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        {t("settings.themeStudio.designStyle")}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {DESIGN_STYLES.map((ds) => {
          const isActive = ds.id === activeStyle;
          const name = ds.name[lang] || ds.name.en;
          const desc = ds.description[lang] || ds.description.en;
          return (
            <button
              key={ds.id}
              onClick={() => onSelect?.(ds.id)}
              className={
                "relative rounded-xl border p-4 text-left transition-all hover-lift " +
                "focus-visible:ring-2 focus-visible:ring-accent/40 " +
                (isActive
                  ? "ring-2 ring-accent border-accent/50 bg-accent/5"
                  : "border-border/40 hover:border-accent/30 bg-card/50")
              }
            >
              <StylePreview styleId={ds.id} />
              <div className="flex items-center gap-2 mt-3">
                <span className="text-lg">{ds.icon}</span>
                <div className="text-sm font-semibold">{name}</div>
              </div>
              <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{desc}</div>
              {isActive && (
                <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-accent text-on-accent flex items-center justify-center text-[10px] font-bold">
                  ✓
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
