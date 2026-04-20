import React, { useState, useRef, useEffect } from "react";
import { ArrowLeft, Settings, Copy, ChevronDown } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider.jsx";

export default function BacktestModeBar({ backtest, onExit, onSettings, onDuplicate, activeTab, setActiveTab }) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [menuOpen]);

  const tabs = [
    { key: "dashboard", label: t("nav.dashboard") },
    { key: "trades", label: t("nav.trades") },
    { key: "analytics", label: t("nav.analytics") },
  ];

  return (
    <div className="sticky top-0 z-30 bg-accent/[0.06] dark:bg-accent/[0.08] border-b border-accent/20 dark:border-accent/15 backdrop-blur-md">
      <div className="flex items-center justify-between px-4 h-12 gap-3">
        {/* Left: exit + backtest name */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onExit}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-accent hover:text-accent/80 transition-colors shrink-0"
            aria-label={t("backtests.exitToLive")}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{t("backtests.exitToLive")}</span>
          </button>
          <div className="h-5 w-px bg-accent/20 shrink-0" />
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[11px] font-semibold text-accent/70 uppercase tracking-wider shrink-0">{t("backtests.mode")}:</span>
            <span className="text-[13px] font-semibold text-foreground truncate">{backtest?.name || "Untitled"}</span>
          </div>
        </div>

        {/* Center: tabs */}
        <div className="hidden md:flex items-center gap-0.5 bg-accent/[0.06] dark:bg-white/[0.04] rounded-lg p-0.5 border border-accent/10 dark:border-white/[0.06]">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={
                "px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all duration-200 " +
                (activeTab === tab.key
                  ? "bg-accent/15 dark:bg-accent/20 text-accent shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/[0.06] dark:hover:bg-white/[0.04]")
              }
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right: actions menu */}
        <div className="relative shrink-0" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-md hover:bg-accent/[0.06] dark:hover:bg-white/[0.04]"
          >
            <Settings className="h-3.5 w-3.5" />
            <ChevronDown className="h-3 w-3" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-card dark:bg-[#1a1f2e] border border-border/50 dark:border-white/[0.08] rounded-xl shadow-xl dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] py-1 z-50">
              <button
                onClick={() => { setMenuOpen(false); onSettings?.(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-foreground hover:bg-accent/[0.06] dark:hover:bg-white/[0.04] transition-colors"
              >
                <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                {t("backtests.settings")}
              </button>
              <button
                onClick={() => { setMenuOpen(false); onDuplicate?.(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-foreground hover:bg-accent/[0.06] dark:hover:bg-white/[0.04] transition-colors"
              >
                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                {t("backtests.duplicate")}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile tabs */}
      <div className="flex md:hidden items-center gap-0.5 px-3 pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={
              "flex-1 px-2 py-1.5 rounded-md text-[12px] font-semibold text-center transition-all duration-200 " +
              (activeTab === tab.key
                ? "bg-accent/15 dark:bg-accent/20 text-accent"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
