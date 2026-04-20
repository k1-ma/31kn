import React, { useState, useMemo, useEffect, useCallback } from "react";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import {
  THEME_PRESETS,
  getPresetById,
  ensureReadable,
  applyPalette,
  COLOR_KEYS,
  normalizeHex,
} from "@/lib/theme.js";
import { X, Palette, Sliders, Paintbrush, Save, Download } from "lucide-react";
import Button from "@/components/ui/Button.jsx";
import ThemePresetGrid from "./ThemePresetGrid.jsx";
import ColorEditor from "./ColorEditor.jsx";
import DesignStylePicker from "./DesignStylePicker.jsx";
import CustomThemeManager from "./CustomThemeManager.jsx";
import ThemeImportExport from "./ThemeImportExport.jsx";

const TABS = [
  { id: "presets", icon: "🎨" },
  { id: "editor", icon: "✏️" },
  { id: "designStyle", icon: "🖌️" },
  { id: "myThemes", icon: "💾" },
  { id: "importExport", icon: "📤" },
];

export default function ThemeStudio({ open, onClose, ui, setUiPatch, theme }) {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState("presets");

  // Local working copies
  const [workingColors, setWorkingColors] = useState(() => ({ ...(ui?.colors || {}) }));
  const [workingColorsDark, setWorkingColorsDark] = useState(() => ({ ...(ui?.colorsDark || {}) }));
  const [workingPresetId, setWorkingPresetId] = useState(() => ui?.presetId || "blue-steel");
  const [workingDesign, setWorkingDesign] = useState(() => ui?.designStyle || "glass");

  // Reset working state when UI changes externally
  useEffect(() => {
    if (open) {
      setWorkingColors({ ...(ui?.colors || {}) });
      setWorkingColorsDark({ ...(ui?.colorsDark || {}) });
      setWorkingPresetId(ui?.presetId || "blue-steel");
      setWorkingDesign(ui?.designStyle || "glass");
    }
  }, [open, ui?.presetId]);

  // Instant preview: apply working palette to the document
  useEffect(() => {
    if (!open) return;
    const pal = theme === "dark" ? workingColorsDark : workingColors;
    applyPalette(pal);
  }, [open, theme, workingColors, workingColorsDark]);

  // Apply design style preview
  useEffect(() => {
    if (!open) return;
    document.documentElement.dataset.design = workingDesign || "glass";
  }, [open, workingDesign]);

  const handleSelectPreset = useCallback((preset) => {
    const light = ensureReadable(preset.light || {});
    const dark = ensureReadable(preset.dark || {});
    setWorkingColors(light);
    setWorkingColorsDark(dark);
    setWorkingPresetId(preset.id);
    if (preset.design) setWorkingDesign(preset.design);
  }, []);

  const handleColorChange = useCallback((mode, pal) => {
    if (mode === "dark") setWorkingColorsDark({ ...pal });
    else setWorkingColors({ ...pal });
  }, []);

  const handleApply = () => {
    setUiPatch?.({
      presetId: workingPresetId,
      colors: workingColors,
      colorsDark: workingColorsDark,
      designStyle: workingDesign,
    });
    onClose?.();
  };

  const handleCancel = () => {
    // Revert to original
    const origPal = theme === "dark" ? (ui?.colorsDark || {}) : (ui?.colors || {});
    applyPalette(origPal);
    if (ui?.designStyle) document.documentElement.dataset.design = ui.designStyle;
    onClose?.();
  };

  const handleSaveCustom = ({ name }) => {
    const customs = [...(ui?.customPresets || [])];
    if (customs.length >= 2) return;
    const id = "custom-" + Date.now();
    customs.push({ id, name, light: { ...workingColors }, dark: { ...workingColorsDark } });
    setUiPatch?.({ customPresets: customs });
    setWorkingPresetId(id);
  };

  const handleDeleteCustom = (id) => {
    const customs = (ui?.customPresets || []).filter((c) => c?.id !== id);
    setUiPatch?.({ customPresets: customs });
    if (workingPresetId === id) {
      setWorkingPresetId("blue-steel");
      const def = getPresetById("blue-steel");
      setWorkingColors(ensureReadable(def.light));
      setWorkingColorsDark(ensureReadable(def.dark));
    }
  };

  const handleEditCustom = (cp) => {
    setWorkingPresetId(cp.id);
    setWorkingColors({ ...(cp.light || {}) });
    setWorkingColorsDark({ ...(cp.dark || {}) });
    setTab("editor");
  };

  const handleDuplicatePreset = (cp) => {
    const customs = [...(ui?.customPresets || [])];
    if (customs.length >= 2) return;
    const id = "custom-" + Date.now();
    const name = typeof cp.name === "string" ? cp.name + " copy" : { ...cp.name };
    if (typeof name === "object") {
      for (const l of Object.keys(name)) name[l] += " copy";
    }
    customs.push({ id, name, light: { ...(cp.light || {}) }, dark: { ...(cp.dark || {}) } });
    setUiPatch?.({ customPresets: customs });
  };

  const handleImport = (config) => {
    if (config.colors) setWorkingColors(config.colors);
    if (config.colorsDark) setWorkingColorsDark(config.colorsDark);
    if (config.presetId) setWorkingPresetId(config.presetId);
    if (config.designStyle) setWorkingDesign(config.designStyle);
  };

  const presetObj = getPresetById(workingPresetId, ui?.customPresets || []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleCancel} />

      {/* Modal */}
      <div className="relative w-[90vw] max-w-5xl h-[85vh] max-h-[85vh] rounded-2xl border border-border/50 bg-card/95 shadow-2xl flex flex-col overflow-hidden sm:flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/30 shrink-0">
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-accent" />
            <span className="text-base font-bold gradient-text">{t("settings.themeStudio.title")}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              {t("settings.themeStudio.cancel")}
            </Button>
            <Button variant="primary" size="sm" onClick={handleApply}>
              {t("settings.themeStudio.apply")}
            </Button>
            <button
              onClick={handleCancel}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Sidebar navigation - hidden on mobile, shown on sm+ */}
          <nav className="hidden sm:flex flex-col w-48 border-r border-border/30 py-2 shrink-0 overflow-y-auto">
            {TABS.map((tb) => (
              <button
                key={tb.id}
                onClick={() => setTab(tb.id)}
                className={
                  "flex items-center gap-2 px-4 py-2.5 text-xs font-semibold transition-all text-left " +
                  (tab === tb.id
                    ? "bg-accent/10 text-accent border-r-2 border-accent"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30")
                }
              >
                <span>{tb.icon}</span>
                {t(`settings.themeStudio.${tb.id}`)}
              </button>
            ))}
          </nav>

          {/* Mobile tabs */}
          <div className="sm:hidden flex border-b border-border/30 overflow-x-auto shrink-0">
            {TABS.map((tb) => (
              <button
                key={tb.id}
                onClick={() => setTab(tb.id)}
                className={
                  "flex items-center gap-1 px-3 py-2 text-[11px] font-semibold whitespace-nowrap transition-all " +
                  (tab === tb.id
                    ? "text-accent border-b-2 border-accent"
                    : "text-muted-foreground")
                }
              >
                <span>{tb.icon}</span>
                {t(`settings.themeStudio.${tb.id}`)}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 min-w-0">
            {tab === "presets" && (
              <ThemePresetGrid
                activePresetId={workingPresetId}
                customPresets={ui?.customPresets || []}
                onSelect={handleSelectPreset}
              />
            )}
            {tab === "editor" && (
              <ColorEditor
                colors={workingColors}
                colorsDark={workingColorsDark}
                presetLight={ensureReadable(presetObj.light || {})}
                presetDark={ensureReadable(presetObj.dark || {})}
                onChange={handleColorChange}
                theme={theme}
              />
            )}
            {tab === "designStyle" && (
              <DesignStylePicker
                activeStyle={workingDesign}
                onSelect={(s) => setWorkingDesign(s)}
              />
            )}
            {tab === "myThemes" && (
              <CustomThemeManager
                customPresets={ui?.customPresets || []}
                activePresetId={workingPresetId}
                colors={workingColors}
                colorsDark={workingColorsDark}
                onSave={handleSaveCustom}
                onDelete={handleDeleteCustom}
                onEdit={handleEditCustom}
                onDuplicate={handleDuplicatePreset}
              />
            )}
            {tab === "importExport" && (
              <ThemeImportExport
                ui={{
                  presetId: workingPresetId,
                  colors: workingColors,
                  colorsDark: workingColorsDark,
                  designStyle: workingDesign,
                }}
                onImport={handleImport}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
