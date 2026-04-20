import React, { useState } from "react";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import Button from "@/components/ui/Button.jsx";
import Badge from "@/components/ui/Badge.jsx";
import ThemeLivePreview from "./ThemeLivePreview.jsx";

export default function CustomThemeManager({
  customPresets = [],
  activePresetId,
  colors,
  colorsDark,
  onSave,
  onDelete,
  onEdit,
  onDuplicate,
}) {
  const { t, lang } = useI18n();
  const [newName, setNewName] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const maxCustom = 2;

  const handleSave = () => {
    const name = newName.trim();
    if (!name) return;
    onSave?.({ name, light: colors || {}, dark: colorsDark || {} });
    setNewName("");
    setShowInput(false);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {t("settings.themeStudio.myThemes")} ({(customPresets || []).length}/{maxCustom})
        </div>
        {(customPresets || []).length < maxCustom && (
          <Button variant="secondary" size="sm" onClick={() => setShowInput(!showInput)}>
            + {t("settings.themeStudio.saveAsCustom")}
          </Button>
        )}
        {(customPresets || []).length >= maxCustom && (
          <Badge variant="warning" className="text-[10px]">
            {t("settings.themeStudio.maxCustomThemes")}
          </Badge>
        )}
      </div>

      {/* Save new */}
      {showInput && (
        <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-muted/10 p-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t("settings.themeStudio.enterName")}
            className="flex-1 h-8 rounded-lg border border-border/50 bg-muted/30 px-3 text-xs text-foreground outline-none focus:border-accent/50"
            maxLength={30}
          />
          <Button variant="primary" size="sm" onClick={handleSave} disabled={!newName.trim()}>
            {t("common.save")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowInput(false)}>
            {t("common.cancel")}
          </Button>
        </div>
      )}

      {/* Custom theme list */}
      {(!customPresets || customPresets.length === 0) && (
        <div className="text-center text-xs text-muted-foreground py-8 rounded-xl border border-dashed border-border/30">
          {t("settings.themeStudio.noCustomYet")}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(customPresets || []).map((cp) => {
          if (!cp) return null;
          const name = typeof cp.name === "string" ? cp.name : (cp.name?.[lang] || cp.name?.en || cp.id);
          const isActive = cp.id === activePresetId;
          return (
            <div
              key={cp.id}
              className={
                "rounded-xl border overflow-hidden transition-all " +
                (isActive ? "ring-2 ring-accent border-accent/50" : "border-border/40")
              }
            >
              <ThemeLivePreview palette={cp.light || {}} className="border-0 rounded-none" />
              <div className="px-3 py-2 flex items-center justify-between gap-1 bg-card/50">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-semibold truncate">{name}</span>
                  {isActive && <Badge variant="solid" className="text-[9px] px-1.5 py-0">✓</Badge>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => onEdit?.(cp)} className="text-[10px] text-muted-foreground hover:text-foreground px-1" title="Edit">✏️</button>
                  <button onClick={() => onDuplicate?.(cp)} className="text-[10px] text-muted-foreground hover:text-foreground px-1" title="Duplicate">📋</button>
                  {confirmDeleteId === cp.id ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => { onDelete?.(cp.id); setConfirmDeleteId(null); }}
                        className="text-[10px] text-red-500 font-semibold px-1">
                        {t("common.confirm")}
                      </button>
                      <button onClick={() => setConfirmDeleteId(null)}
                        className="text-[10px] text-muted-foreground px-1">
                        {t("common.cancel")}
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDeleteId(cp.id)}
                      className="text-[10px] text-muted-foreground hover:text-red-500 px-1" title="Delete">🗑️</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
