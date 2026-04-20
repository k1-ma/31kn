import React from "react";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import Switch from "@/components/ui/Switch.jsx";
import {
  PanelLeft,
  LayoutDashboard,
  BarChart3,
  BookOpen,
  Wallet,
  Building2,
  FlaskConical,
  FileText,
  Lightbulb,
  GraduationCap,
  Trophy,
  Shapes,
  Clock,
  Trash2,
  Brain,
} from "lucide-react";

// All hideable sidebar items with their i18n keys and icons
const SIDEBAR_ITEMS = [
  { key: "accounts", icon: Wallet, group: "manage" },
  { key: "programs", icon: Building2, group: "manage" },
  { key: "backtests", icon: FlaskConical, group: "manage" },
  { key: "documents", icon: FileText, group: "library" },
  { key: "ideas", icon: Lightbulb, group: "library" },
  { key: "education", icon: GraduationCap, group: "library" },
  { key: "tournament", icon: Trophy, group: "library" },
  { key: "pairs", icon: Shapes, group: "library" },
  { key: "sessions", icon: Clock, group: "library" },
  { key: "trash", icon: Trash2, group: "other" },
];

export default function SidebarSettingsCard({ hiddenNavItems = [], onToggleNavItem, modelsEnabled = false, onToggleModels }) {
  const { t } = useI18n();

  const isHidden = (key) => hiddenNavItems.includes(key);

  const groups = [
    { id: "manage", label: t("settings.sidebar.groupManage") },
    { id: "library", label: t("settings.sidebar.groupLibrary") },
    { id: "other", label: t("settings.sidebar.groupOther") },
  ];

  return (
    <Card className="premium-panel">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <PanelLeft className="h-5 w-5" />
          {t("settings.sidebar.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-xs text-muted-foreground">
          {t("settings.sidebar.description")}
        </div>

        {/* Models feature toggle */}
        <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-3 space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <Brain className={"h-4 w-4 " + (modelsEnabled ? "text-violet-500" : "text-muted-foreground/40")} />
              <div className="min-w-0">
                <div className={"text-sm font-semibold " + (modelsEnabled ? "" : "text-muted-foreground/50")}>
                  {t("settings.modelsFeature.title")}
                </div>
                <div className="text-[11px] text-muted-foreground/70 leading-tight">
                  {t("settings.modelsFeature.description")}
                </div>
              </div>
            </div>
            <Switch
              checked={modelsEnabled}
              onCheckedChange={() => onToggleModels?.()}
            />
          </div>
        </div>

        {groups.map((grp) => {
          const items = SIDEBAR_ITEMS.filter((it) => it.group === grp.id);
          if (!items.length) return null;
          return (
            <div key={grp.id} className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/60 px-1">
                {grp.label}
              </div>
              {items.map((item) => {
                const Icon = item.icon;
                const hidden = isHidden(item.key);
                return (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/30 bg-muted/10 px-3 py-2"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon className={"h-4 w-4 " + (hidden ? "text-muted-foreground/40" : "text-muted-foreground")} />
                      <span className={"text-sm font-medium " + (hidden ? "text-muted-foreground/50 line-through" : "")}>
                        {t(`nav.${item.key}`)}
                      </span>
                    </div>
                    <Switch
                      checked={!hidden}
                      onCheckedChange={() => onToggleNavItem?.(item.key)}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
