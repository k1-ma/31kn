import React, { useMemo, useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Button from "@/components/ui/Button.jsx";
import SocialLinks from "@/components/common/SocialLinks.jsx";
import NotificationBell from "@/components/common/NotificationBell.jsx";
import hauntedLogo from "@/assets/haunted.png";
import {
  Command,
  BarChart3,
  BookOpen,
  Wallet,
  Shapes,
  Clock,
  Settings,
  Sun,
  Moon,
  Trash2,
  Menu,
  X,
  Building2,
  Plus,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Lightbulb,
  History,
  FileText,
  LayoutDashboard,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronsUpDown,
  FlaskConical,
  GraduationCap,
  Trophy,
  Brain,
  Tag,
} from "lucide-react";
import { page } from "@/components/common/motion";
import { HOVER_GLOW } from "@/lib/ui.js";
import { useI18n } from "@/i18n/I18nProvider.jsx";

/* ─── Redesigned NavItem with left accent bar ─── */
function NavItem({ icon, label, active, onClick, collapsed, badge }) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={
        `group relative flex items-center transition-all duration-200 ${
          collapsed ? "w-11 h-11 justify-center rounded-lg mx-auto" : "w-full gap-3 px-3 py-[7px] rounded-lg"
        } ` +
        (active
          ? "bg-accent/8 dark:bg-white/[0.06] text-foreground shadow-[inset_0_0_0_1px_rgb(var(--border)/0.3)]"
          : "text-muted-foreground hover:bg-accent/5 dark:hover:bg-white/[0.04] hover:text-foreground")
      }
    >
      {/* Left accent bar for active state */}
      {active && !collapsed && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-gradient-to-b from-accent to-accent-2" />
      )}
      <span className={`shrink-0 transition-all duration-200 ${active ? "text-accent" : "text-muted-foreground group-hover:text-foreground/70"}`}>
        {icon}
      </span>
      {!collapsed && (
        <span className={`text-[13px] truncate ${active ? "font-semibold" : "font-medium"}`}>{label}</span>
      )}
      {badge && !collapsed && (
        <span className="ml-auto text-[10px] font-bold bg-accent/10 text-accent px-1.5 py-0.5 rounded-md">{badge}</span>
      )}
    </button>
  );
}

/* ─── Separator between nav groups ─── */
function NavSep({ collapsed }) {
  return collapsed
    ? <div className="w-6 h-px bg-border/50 dark:bg-white/[0.06] mx-auto my-1.5" />
    : <div className="h-px bg-border/30 dark:bg-white/[0.04] mx-2 my-2" />;
}

/* ─── Section label for nav groups ─── */
function NavGroupLabel({ label, collapsed }) {
  if (collapsed) return null;
  return (
    <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60 select-none">
      {label}
    </div>
  );
}

export default function Shell({
  active,
  setActive,
  theme,
  setTheme,
  allowedNavKeys = null,
  hiddenNavItems = [],
  modelsEnabled = false,
  banner = null,
  onOpenCommand,
  onQuickTrade,
  onLogout,
  onInboxClick,
  topRight,
  children,
}) {
  const { t } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem("tradej_sidebar_collapsed");
      return stored === null ? false : stored === "true";
    } catch { return false; }
  });
  
  useEffect(() => {
    try {
      localStorage.setItem("tradej_sidebar_collapsed", collapsed ? "true" : "false");
    } catch {}
  }, [collapsed]);

  const iconSize = "h-[18px] w-[18px]";

  const hidden = useMemo(() => new Set(Array.isArray(hiddenNavItems) ? hiddenNavItems : []), [hiddenNavItems]);

  /* ─── Navigation structure: grouped for clarity ─── */
  const coreNavItems = useMemo(() => {
    const items = [
      { key: "dashboard", label: t("nav.dashboard"), icon: <LayoutDashboard className={iconSize} /> },
      { key: "analytics", label: t("nav.analytics"), icon: <BarChart3 className={iconSize} /> },
      { key: "trades", label: t("nav.trades"), icon: <BookOpen className={iconSize} /> },
    ];
    const allowed = Array.isArray(allowedNavKeys) && allowedNavKeys.length ? new Set(allowedNavKeys) : null;
    return (allowed ? items.filter((it) => allowed.has(it.key)) : items).filter((it) => !hidden.has(it.key));
  }, [allowedNavKeys, hidden, t]);

  const manageNavItems = useMemo(() => {
    const items = [
      { key: "accounts", label: t("nav.accounts"), icon: <Wallet className={iconSize} /> },
      { key: "programs", label: t("nav.programs"), icon: <Building2 className={iconSize} /> },
      { key: "backtests", label: t("nav.backtests"), icon: <FlaskConical className={iconSize} /> },
    ];
    const allowed = Array.isArray(allowedNavKeys) && allowedNavKeys.length ? new Set(allowedNavKeys) : null;
    return (allowed ? items.filter((it) => allowed.has(it.key)) : items).filter((it) => !hidden.has(it.key));
  }, [allowedNavKeys, hidden, t]);

  const libraryNavItems = useMemo(() => {
    const items = [
      { key: "documents", label: t("nav.documents"), icon: <FileText className={iconSize} /> },
      { key: "ideas", label: t("nav.ideas"), icon: <Lightbulb className={iconSize} /> },
      ...(modelsEnabled ? [{ key: "models", label: t("nav.models"), icon: <Brain className={iconSize} /> }] : []),
      { key: "education", label: t("nav.education"), icon: <GraduationCap className={iconSize} /> },
      { key: "tournament", label: t("nav.tournament", null, "Tournament"), icon: <Trophy className={iconSize} /> },
      { key: "pairs", label: t("nav.pairs"), icon: <Shapes className={iconSize} /> },
      { key: "sessions", label: t("nav.sessions"), icon: <Clock className={iconSize} /> },
      { key: "tags", label: t("nav.tags", null, "Tags"), icon: <Tag className={iconSize} /> },
    ];
    const allowed = Array.isArray(allowedNavKeys) && allowedNavKeys.length ? new Set(allowedNavKeys) : null;
    return (allowed ? items.filter((it) => allowed.has(it.key)) : items).filter((it) => !hidden.has(it.key));
  }, [allowedNavKeys, hidden, modelsEnabled, t]);

  // For mobile nav, flatten all items
  const mainNavItems = useMemo(() => [...coreNavItems, ...manageNavItems, ...libraryNavItems], [coreNavItems, manageNavItems, libraryNavItems]);

  const sidebarWidth = collapsed ? "w-[64px]" : "w-[252px]";

  /* ─── Shared sidebar content renderer ─── */
  function SidebarContent({ isMobile = false }) {
    const onNav = (key) => {
      setActive(key);
      if (isMobile) setMobileOpen(false);
    };

    return (
      <div className="flex flex-col h-full">
        {/* ─── Logo area ─── */}
        <div className={`flex items-center ${collapsed && !isMobile ? "justify-center px-1" : "justify-between px-3"} h-14 shrink-0`}>
          <div className={`flex items-center ${collapsed && !isMobile ? "gap-0" : "gap-2.5"} min-w-0`}>
            <div className={`${collapsed && !isMobile ? "h-7 w-7" : "h-8 w-8"} shrink-0 rounded-lg overflow-hidden ring-1 ring-border/50 dark:ring-white/[0.08]`}>
              <img src={hauntedLogo} alt={t("app.title")} className="h-full w-full object-cover" draggable={false} />
            </div>
            {(!collapsed || isMobile) && (
              <div className="min-w-0">
                <div className="text-[13px] font-display font-bold leading-none bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent uppercase tracking-[0.1em]">{t("app.title")}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5 leading-none">{t("app.nav")}</div>
              </div>
            )}
          </div>
          {/* Close (mobile) or Collapse (desktop expanded only) — right of logo */}
          {isMobile ? (
            <button onClick={() => setMobileOpen(false)} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-accent/5 dark:hover:bg-white/[0.04]">
              <X className="h-4 w-4" />
            </button>
          ) : !collapsed ? (
            <button
              onClick={() => setCollapsed(true)}
              title={t("shell.collapse")}
              className="shrink-0 text-muted-foreground hover:text-foreground/70 hover:bg-accent/5 dark:hover:bg-white/[0.03] transition-all duration-150 rounded-md p-1.5"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {/* ─── Quick Add Trade (expanded only) ─── */}
        {(!collapsed || isMobile) && (
          <div className="px-2.5 mb-1">
            <button
              onClick={() => { onQuickTrade?.(); if (isMobile) setMobileOpen(false); }}
              className="w-full h-9 flex items-center justify-center gap-2 rounded-lg text-[12px] font-semibold uppercase tracking-wider bg-accent/10 text-accent border border-accent/20 hover:border-accent/40 hover:bg-accent/15 hover:shadow-sm transition-all duration-200 active:scale-[0.97]"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{t("nav.addTrade")}</span>
            </button>
          </div>
        )}
        {collapsed && !isMobile && (
          <div className="flex justify-center mb-1">
            <button
              onClick={() => { onQuickTrade?.(); }}
              title={t("nav.addTrade")}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-accent/10 text-accent border border-accent/20 hover:bg-accent/15 transition-all"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* ─── Scrollable nav area ─── */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-1 no-scrollbar">
          {/* Core */}
          <NavGroupLabel label={t("shell.groupCore") || "Core"} collapsed={collapsed && !isMobile} />
          <div className={`space-y-0.5 ${collapsed && !isMobile ? "px-1" : "px-1.5"}`}>
            {coreNavItems.map((it) => (
              <NavItem key={it.key} icon={it.icon} label={it.label} active={active === it.key} collapsed={collapsed && !isMobile} onClick={() => onNav(it.key)} />
            ))}
          </div>

          <NavSep collapsed={collapsed && !isMobile} />

          {/* Manage */}
          <NavGroupLabel label={t("shell.groupManage") || "Manage"} collapsed={collapsed && !isMobile} />
          <div className={`space-y-0.5 ${collapsed && !isMobile ? "px-1" : "px-1.5"}`}>
            {manageNavItems.map((it) => (
              <NavItem key={it.key} icon={it.icon} label={it.label} active={active === it.key} collapsed={collapsed && !isMobile} onClick={() => onNav(it.key)} />
            ))}
          </div>

          <NavSep collapsed={collapsed && !isMobile} />

          {/* Library */}
          <NavGroupLabel label={t("shell.groupLibrary") || "Library"} collapsed={collapsed && !isMobile} />
          <div className={`space-y-0.5 ${collapsed && !isMobile ? "px-1" : "px-1.5"}`}>
            {libraryNavItems.map((it) => (
              <NavItem key={it.key} icon={it.icon} label={it.label} active={active === it.key} collapsed={collapsed && !isMobile} onClick={() => onNav(it.key)} />
            ))}
          </div>

          {/* Trash */}
          {!hidden.has("trash") && (
            <>
              <NavSep collapsed={collapsed && !isMobile} />
              <div className={`space-y-0.5 ${collapsed && !isMobile ? "px-1" : "px-1.5"}`}>
                <NavItem icon={<Trash2 className={iconSize} />} label={t("nav.trash")} active={active === "trash"} collapsed={collapsed && !isMobile} onClick={() => onNav("trash")} />
              </div>
            </>
          )}
        </div>

        {/* ─── Bottom section ─── */}
        <div className="shrink-0 border-t border-border/30 dark:border-white/[0.05] pt-1.5 pb-2">
          <div className={`space-y-0.5 ${collapsed && !isMobile ? "px-1" : "px-1.5"}`}>
            {/* Expand toggle — only visible when collapsed (above social links) */}
            {collapsed && !isMobile && (
              <button
                onClick={() => setCollapsed(false)}
                title={t("shell.expand")}
                className="w-11 h-11 flex items-center justify-center rounded-lg mx-auto text-muted-foreground hover:text-foreground/70 hover:bg-accent/5 dark:hover:bg-white/[0.03] transition-all duration-150"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            )}
            {/* Social Links */}
            <SocialLinks variant="sidebar" collapsed={collapsed && !isMobile} />
            
            {/* Updates */}
            <NavItem icon={<Sparkles className={iconSize} />} label={t("nav.updates")} active={active === "updates"} collapsed={collapsed && !isMobile} onClick={() => onNav("updates")} />
            
            {/* Theme Toggle */}
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title={theme === "dark" ? t("settings.light") : t("settings.dark")}
              className={`group flex items-center transition-all duration-150 text-muted-foreground hover:bg-accent/5 dark:hover:bg-white/[0.035] hover:text-foreground ${
                collapsed && !isMobile ? "w-11 h-11 justify-center rounded-lg mx-auto" : "w-full gap-3 px-3 py-[7px] rounded-lg"
              }`}
            >
              {theme === "dark" ? <Sun className={`${iconSize} text-muted-foreground group-hover:text-foreground/70 transition-colors`} /> : <Moon className={`${iconSize} text-muted-foreground group-hover:text-foreground/70 transition-colors`} />}
              {(!collapsed || isMobile) && <span className="text-[13px] font-medium">{theme === "dark" ? t("settings.light") : t("settings.dark")}</span>}
            </button>
            
            {/* Settings */}
            <NavItem icon={<Settings className={iconSize} />} label={t("nav.settings")} active={active === "settings"} collapsed={collapsed && !isMobile} onClick={() => onNav("settings")} />
            
            {/* Logout */}
            {onLogout && (
              <button
                onClick={() => { onLogout(); if (isMobile) setMobileOpen(false); }}
                title={t("shell.logout")}
                className={`group flex items-center transition-all duration-150 text-muted-foreground hover:bg-red-500/8 hover:text-red-500 dark:hover:text-red-400 ${
                  collapsed && !isMobile ? "w-11 h-11 justify-center rounded-lg mx-auto" : "w-full gap-3 px-3 py-[7px] rounded-lg"
                }`}
              >
                <LogOut className={`${iconSize} text-muted-foreground group-hover:text-red-500 dark:group-hover:text-red-400 transition-colors`} />
                {(!collapsed || isMobile) && <span className="text-[13px] font-medium">{t("shell.logout")}</span>}
              </button>
            )}
          </div>
          

        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen app-bg">
      {/* Skip-to-content link for keyboard/screen-reader users.
          Visually hidden until focused, then floats above the nav. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-3 focus:py-2 focus:rounded-md focus:bg-accent focus:text-white focus:shadow-lg focus:outline-none"
      >
        {t("a11y.skipToContent") || "Skip to content"}
      </a>
      <div className="pointer-events-none fixed inset-0 grid-overlay opacity-[0.12]" />
      <div className="relative flex min-h-screen w-full">
        {/* Desktop Sidebar */}
        <aside
          aria-label={t("shell.sidebar") || "Sidebar navigation"}
          className={`hidden md:flex flex-col ${sidebarWidth} shrink-0 border-r border-border/50 dark:border-white/[0.04] bg-card dark:bg-[#060910]/95 transition-[width] duration-200 ease-out fixed top-0 left-0 h-screen z-40`}
        >
          <SidebarContent />
        </aside>

        {/* Spacer for fixed sidebar */}
        <div className={`hidden md:block ${sidebarWidth} shrink-0 transition-[width] duration-200`} />
        
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile top bar */}
          <div className="md:hidden sticky top-0 z-40 border-b border-border/50 dark:border-white/[0.05] bg-card dark:bg-[#060910]/95 safe-top">
            <div className="flex items-center justify-between gap-2 px-3 h-14">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  onClick={() => setMobileOpen(true)}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-accent/5 dark:hover:bg-white/[0.04]"
                  title={t("shell.menu")}
                  aria-label={t("shell.menu") || "Open navigation menu"}
                  aria-expanded={mobileOpen}
                >
                  <Menu className="h-5 w-5" aria-hidden="true" />
                </button>
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-7 w-7 shrink-0 rounded-md overflow-hidden ring-1 ring-border/50 dark:ring-white/[0.08]">
                    <img src={hauntedLogo} alt={t("app.title")} className="h-full w-full object-cover" draggable={false} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[12px] font-display font-bold leading-none truncate bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent uppercase tracking-[0.1em]">{t("app.title")}</div>
                    <div className="text-[10px] text-muted-foreground truncate mt-0.5">{mainNavItems.find((n) => n.key === active)?.label}</div>
                  </div>
                </div>
              </div>
              <div className="flex items-center shrink-0">{topRight}</div>
            </div>
          </div>

          <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 p-2.5 sm:p-3 md:p-5 lg:p-6">
            <div className="mb-3 hidden md:flex items-center justify-end">{topRight}</div>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div key={active} {...page(false)}>
                {children}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>

      {/* Mobile slide-over nav */}
      <AnimatePresence>
        {mobileOpen ? (
          <motion.div
            className="fixed inset-0 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label={t("shell.menu") || "Navigation menu"}
            onKeyDown={(e) => { if (e.key === "Escape") setMobileOpen(false); }}
          >
            <button
              type="button"
              aria-label={t("common.close") || "Close menu"}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-default"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ type: "spring", stiffness: 500, damping: 38 }}
              className="absolute left-0 top-0 h-full w-[260px] border-r border-border/50 dark:border-white/[0.05] bg-card dark:bg-[#060910]/97 flex flex-col shadow-[4px_0_30px_rgba(0,0,0,0.15)] dark:shadow-[4px_0_30px_rgba(0,0,0,0.4)] safe-top"
            >
              <SidebarContent isMobile />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
