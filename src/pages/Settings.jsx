import React, { useState, useCallback, lazy, Suspense } from "react";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { Card, CardContent } from "@/components/ui/Card.jsx";
import ProfileSettingsCard from "@/components/settings/ProfileSettingsCard.jsx";
import AppearanceCard from "@/components/settings/AppearanceCard.jsx";
import SidebarSettingsCard from "@/components/settings/SidebarSettingsCard.jsx";
import SecurityCard from "@/components/settings/SecurityCard.jsx";
import DevicesCard from "@/components/settings/DevicesCard.jsx";
import DataCard from "@/components/settings/DataCard.jsx";
import MetricsCard from "@/components/settings/MetricsCard.jsx";
import { Settings as SettingsIcon, Moon, Sun, Globe } from "lucide-react";
import { SUPPORTED_LANGS } from "@/i18n/translations.js";

const ThemeStudio = lazy(() => import("@/components/settings/ThemeStudio.jsx"));

export default function Settings({ theme, setTheme, exportJSON, importJSON, resetAll, ui, setUiPatch }) {
  const { t, lang } = useI18n();
  const [studioOpen, setStudioOpen] = useState(false);

  const handleToggleNavItem = useCallback((key) => {
    const current = ui?.hiddenNavItems || [];
    const next = current.includes(key)
      ? current.filter((k) => k !== key)
      : [...current, key];
    setUiPatch({ hiddenNavItems: next });
  }, [ui, setUiPatch]);

  return (
    <div className="space-y-4">
      {/* Enhanced Settings Header */}
      <div className="rounded-xl border border-border bg-gradient-to-r from-card via-muted/10 to-card p-6 relative overflow-hidden">
        {/* Background decorative elements */}
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent/5 blur-3xl" />
        <div className="absolute -left-16 -bottom-16 h-36 w-36 rounded-full bg-accent/10 blur-2xl" />
        
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-accent/20 to-accent/10 flex items-center justify-center border border-accent/20">
              <SettingsIcon className="h-7 w-7 text-accent" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">{t("settings.title")}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{t("settings.subtitle")}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted/30 border border-border/50">
              {theme === "dark" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
              <span className="text-sm font-medium">{theme === "dark" ? t("settings.dark") : t("settings.light")}</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted/30 border border-border/50">
              <Globe className="h-5 w-5" />
              <span className="text-sm font-medium">{SUPPORTED_LANGS.find((l) => l.id === lang)?.label || "English"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main grid: 2 columns on lg+ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left Column: Profile + Devices */}
        <div className="space-y-4">
          <ProfileSettingsCard />
          <DevicesCard />
        </div>

        {/* Right Column: Appearance + Security + Metrics */}
        <div className="space-y-4">
          <AppearanceCard 
            theme={theme} 
            setTheme={setTheme}
            ui={ui}
            onOpenStudio={() => setStudioOpen(true)}
          />
          <SidebarSettingsCard
            hiddenNavItems={ui?.hiddenNavItems || []}
            onToggleNavItem={handleToggleNavItem}
            modelsEnabled={!!ui?.modelsEnabled}
            onToggleModels={() => setUiPatch({ modelsEnabled: !ui?.modelsEnabled })}
          />
          <SecurityCard />
          <MetricsCard 
            winRateMode={ui?.winRateMode || "ignore"}
            onWinRateModeChange={(mode) => setUiPatch({ winRateMode: mode })}
            avgRRMode={ui?.avgRRMode || "winsOnly"}
            onAvgRRModeChange={(mode) => setUiPatch({ avgRRMode: mode })}
            pnlDisplayMode={ui?.pnlDisplayMode || "money"}
            onPnlDisplayModeChange={(mode) => setUiPatch({ pnlDisplayMode: mode })}
          />
        </div>
      </div>

      {/* Data section - full width */}
      <DataCard 
        exportJSON={exportJSON} 
        importJSON={importJSON} 
        resetAll={resetAll} 
      />

      {/* Theme Studio modal (lazy loaded) */}
      {studioOpen && (
        <Suspense fallback={null}>
          <ThemeStudio
            open={studioOpen}
            onClose={() => setStudioOpen(false)}
            ui={ui}
            setUiPatch={setUiPatch}
            theme={theme}
          />
        </Suspense>
      )}
    </div>
  );
}
