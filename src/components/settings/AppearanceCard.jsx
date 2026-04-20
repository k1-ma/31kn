import React from "react";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { useAnimations } from "@/lib/animations.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import Button from "@/components/ui/Button.jsx";
import Switch from "@/components/ui/Switch.jsx";
import Badge from "@/components/ui/Badge.jsx";
import { Zap, Palette } from "lucide-react";
import { SUPPORTED_LANGS } from "@/i18n/translations.js";
import { getPresetById } from "@/lib/theme.js";

export default function AppearanceCard({ theme, setTheme, ui, onOpenStudio }) {
  const { t, lang, setLang } = useI18n();
  const { disableAnimations, setDisableAnimations } = useAnimations();

  const presetId = ui?.presetId || "blue-steel";
  const preset = getPresetById(presetId, ui?.customPresets || []);
  const presetName = preset?.name
    ? (typeof preset.name === "object" ? (preset.name[lang] || preset.name.en) : preset.name)
    : presetId;
  const pal = theme === "dark" ? (ui?.colorsDark || preset?.dark || {}) : (ui?.colors || preset?.light || {});
  const previewColors = [pal.bg, pal.accent, pal.success, pal.danger, pal.card].filter(Boolean);

  return (
    <Card className="premium-panel">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5" />
          {t("settings.appearance")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Theme Studio button */}
        <button
          onClick={onOpenStudio}
          className="w-full flex items-center gap-3 rounded-xl border border-accent/30 bg-gradient-to-r from-accent/10 to-accent/5 p-3 transition-all hover:from-accent/15 hover:to-accent/10 hover:border-accent/50 group"
        >
          <div className="h-9 w-9 rounded-lg bg-accent/15 flex items-center justify-center shrink-0 group-hover:bg-accent/25 transition-colors">
            <Palette className="h-5 w-5 text-accent" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="text-sm font-semibold">{t("settings.themeStudio.title")}</div>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="outline" className="text-[9px]">{presetName}</Badge>
              <div className="flex gap-0.5">
                {previewColors.map((c, i) => (
                  <span key={i} className="h-3 w-3 rounded-full border border-border/30" style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          </div>
          <span className="text-muted-foreground text-sm group-hover:text-foreground transition-colors">→</span>
        </button>

        {/* Theme toggle */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 p-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">{t("settings.theme")}</div>
            <div className="text-xs text-muted-foreground">
              {theme === "dark" ? t("settings.dark") : t("settings.light")}
            </div>
          </div>
          <Button 
            variant="secondary" 
            size="sm"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="shrink-0"
          >
            {t("common.toggle")}
          </Button>
        </div>

        {/* Language selector */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 p-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">{t("settings.language")}</div>
            <div className="text-xs text-muted-foreground">
              {SUPPORTED_LANGS.find((l) => l.id === lang)?.label || "English"}
            </div>
          </div>
          <select
            className="h-9 rounded-xl border border-border/50 bg-card/70 px-3 text-sm hover:border-accent/40 focus:border-accent/60 focus:ring-2 focus:ring-accent/30 transition-all duration-150 cursor-pointer shrink-0"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
          >
            {SUPPORTED_LANGS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        {/* Animations toggle */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 p-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
              <Zap className="h-5 w-5 text-accent" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold">{t("settings.disableAnimations.title")}</div>
              <div className="text-xs text-muted-foreground">{t("settings.disableAnimations.description")}</div>
            </div>
          </div>
          <Switch 
            checked={disableAnimations} 
            onCheckedChange={setDisableAnimations} 
            className="shrink-0"
          />
        </div>
      </CardContent>
    </Card>
  );
}
