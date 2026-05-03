import React, { useState } from "react";
import Button from "@/components/ui/Button.jsx";
import Badge from "@/components/ui/Badge.jsx";
import { useAuth } from "@/auth/AuthProvider.jsx";
import { LogOut, Shield, Cloud, CloudOff, User, AlertTriangle, RefreshCw, Save, Check } from "lucide-react";

function statusBadge(syncStatus, hasUnsavedChanges) {
  // Chunk-progress is rendered in OfflineBanner, not here — keeping it out of
  // the topbar avoids width changes ("1/5" → "10/50") that shift adjacent items.
  //
  // "saving", "pending while we still have unsaved data", and "synced but with
  // unsaved data" all collapse to the same blue "Saving…" pill.  This prevents
  // the badge from blinking Save → Cloud → Save when the sync pipeline
  // transitions between iterations of a coalesced multi-mutation sync (delete
  // + delete + delete during one chunked upload).  A real "Pending" badge only
  // shows when there's nothing actively in flight to back it up.
  const inProgress =
    syncStatus === "saving" ||
    ((syncStatus === "pending" || syncStatus === "synced") && hasUnsavedChanges);
  if (inProgress) {
    return { label: "Saving…", icon: <Save className="h-3.5 w-3.5 animate-pulse" />, variant: "default", tooltip: "Syncing to server…", glowClass: "session-badge-glow-blue" };
  }
  if (syncStatus === "synced") return { label: "Synced", icon: <Check className="h-3.5 w-3.5" />, variant: "success", tooltip: "All changes saved", glowClass: "session-badge-glow-green" };
  if (syncStatus === "pending") return { label: "Pending", icon: <Cloud className="h-3.5 w-3.5" />, variant: "warning", tooltip: "Pending server confirmation", glowClass: "session-badge-glow-orange" };
  if (syncStatus === "offline") return { label: "Offline", icon: <CloudOff className="h-3.5 w-3.5" />, variant: "warning", tooltip: "Offline - changes saved locally", glowClass: "session-badge-glow-orange" };
  if (syncStatus === "error") return { label: "Sync error", icon: <CloudOff className="h-3.5 w-3.5" />, variant: "error", tooltip: "Sync failed - changes saved locally", glowClass: "session-badge-glow-red" };
  if (syncStatus === "unauthorized") return { label: "Auth error", icon: <AlertTriangle className="h-3.5 w-3.5" />, variant: "error", tooltip: "Auth error - changes saved locally", glowClass: "session-badge-glow-red" };
  if (syncStatus === "loading") return { label: "Loading…", icon: <Cloud className="h-3.5 w-3.5 animate-pulse" />, variant: "default", tooltip: "Loading…", glowClass: "session-badge-glow-default" };
  return { label: "Synced", icon: <Check className="h-3.5 w-3.5" />, variant: "success", tooltip: "All changes saved", glowClass: "session-badge-glow-green" };
}

function UserMenu({
  syncStatus = "synced",
  hasUnsavedChanges = false,
  onRetrySync,
  lastError,
}) {
  const { user, logout } = useAuth();
  const role = user?.role || "user";
  const roleColor = user?.role_color || null;
  const displayName = (user?.display_name || user?.nickname || user?.username || "").trim();
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    if (!onRetrySync || retrying) return;
    setRetrying(true);
    try {
      await onRetrySync();
    } finally {
      setRetrying(false);
    }
  };

  const hexToRgb = (hex) => {
    const s = String(hex || "").trim();
    const re = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
    if (!re.test(s)) return null;
    let h = s.slice(1);
    if (h.length === 3) h = `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
    if (h.length === 8) h = h.slice(0, 6);
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if (![r, g, b].every((v) => Number.isFinite(v))) return null;
    return { r, g, b };
  };

  const roleStyle = (r, color) => {
    const rr = String(r || "user").toLowerCase();
    const baseIcon = rr === "admin" ? <Shield className="h-3 w-3" /> : <User className="h-3 w-3" />;

    const rgb = hexToRgb(color);
    if (rgb) {
      return {
        label: rr,
        icon: baseIcon,
        className: "border backdrop-blur-sm",
        style: {
          backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`,
          borderColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.30)`,
          color: "rgba(255,255,255,0.92)",
        },
      };
    }

    if (rr === "admin") return { label: "admin", icon: baseIcon, className: "bg-accent/15 text-foreground border-accent/25 backdrop-blur-sm" };
    if (rr === "loh") return { label: "loh", icon: baseIcon, className: "bg-fuchsia-500/15 text-fuchsia-100 border-fuchsia-400/25 backdrop-blur-sm" };
    if (rr === "manager") return { label: "manager", icon: baseIcon, className: "bg-emerald-500/15 text-emerald-100 border-emerald-400/25 backdrop-blur-sm" };

    const palette = [
      "bg-sky-500/15 text-sky-100 border-sky-400/25 backdrop-blur-sm",
      "bg-amber-500/15 text-amber-100 border-amber-400/25 backdrop-blur-sm",
      "bg-rose-500/15 text-rose-100 border-rose-400/25 backdrop-blur-sm",
      "bg-lime-500/15 text-lime-100 border-lime-400/25 backdrop-blur-sm",
    ];
    let h = 0;
    for (let i = 0; i < rr.length; i++) h = (h * 31 + rr.charCodeAt(i)) >>> 0;
    return { label: rr, icon: baseIcon, className: palette[h % palette.length] };
  };

  const s = statusBadge(syncStatus, hasUnsavedChanges);
  const r = roleStyle(role, roleColor);
  const showRole = (role && role !== "user") || !!roleColor;
  const showRetry = onRetrySync && (syncStatus === "error" || syncStatus === "offline" || hasUnsavedChanges);
  
  // Build tooltip with error info
  let tooltip = s.tooltip;
  if (lastError?.message && syncStatus === "error") {
    tooltip = `Error: ${lastError.message}`;
  }

  return (
    <div className="flex items-center gap-1.5 sm:gap-2.5">
      {/* Main user panel with premium styling */}
      <div className="group relative flex min-w-0 max-w-[55vw] sm:max-w-[70vw] items-center gap-1.5 sm:gap-2.5 rounded-xl px-2 sm:px-3 py-2 min-h-[38px] sm:min-h-[42px] transition-all duration-300 hover:scale-[1.01]">
        {/* Gradient border effect */}
        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-accent/20 via-accent-2/15 to-accent/20 opacity-60 group-hover:opacity-80 transition-opacity duration-300" />
        <div className="absolute inset-[1px] rounded-lg bg-card/80 dark:bg-[rgb(var(--card))]/80 backdrop-blur-xl" />
        
        {/* Content container */}
        <div className="relative flex items-center gap-1.5 sm:gap-2.5">
          {/* Avatar */}
          <div className="relative">
            <div className="absolute -inset-[2px] rounded-full bg-gradient-to-br from-accent/70 to-accent/40 opacity-60 group-hover:opacity-80 transition-opacity duration-300" />
            <div className="relative h-6 w-6 sm:h-7 sm:w-7 shrink-0 overflow-hidden rounded-full bg-card flex items-center justify-center border border-accent/20">
              <User className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-accent" />
            </div>
          </div>
          
          {/* Username - hidden on very small screens */}
          {displayName ? (
            <div className="min-w-0 flex flex-col justify-center hidden xs:flex">
              <div className="truncate text-xs sm:text-sm font-display font-semibold leading-tight tracking-wide text-foreground max-w-[80px] sm:max-w-none">
                {displayName}
              </div>
            </div>
          ) : null}
          
          {/* Role badge */}
          {showRole ? (
            <Badge className={`inline-flex items-center gap-1 py-0.5 px-2 text-[10px] uppercase tracking-wider font-semibold ${r.className}`} style={r.style}>
              {r.icon}
              <span>{r.label}</span>
            </Badge>
          ) : null}
          
          {/* Sync status indicator — fixed-size box so neighbours don't shift
              when the icon/variant swaps between saving/synced/error states. */}
          <div
            className={`flex items-center justify-center h-7 w-7 rounded-full cursor-help transition-colors duration-200 ${s.glowClass} ${
              s.variant === "error"
                ? "bg-red-500/15 border border-red-500/30 text-red-400"
                : s.variant === "warning"
                  ? "bg-amber-500/15 border border-amber-500/30 text-amber-400"
                  : s.variant === "success"
                    ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400"
                    : "bg-accent/15 border border-accent/30 text-accent"
            }`}
            title={tooltip}
          >
            {s.icon}
          </div>
          
          {/* Retry button */}
          {showRetry ? (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 w-6 p-0 rounded-full hover:bg-accent/15 transition-colors duration-200" 
              onClick={handleRetry}
              disabled={retrying}
              title="Retry sync"
            >
              <RefreshCw className={`h-3 w-3 text-foreground/70 ${retrying ? "animate-spin" : ""}`} />
            </Button>
          ) : null}
        </div>
      </div>

      {/* Logout button with matching style */}
      <Button 
        variant="ghost" 
        className="relative h-[38px] w-[38px] sm:h-[42px] sm:w-[42px] p-0 rounded-xl overflow-hidden group/logout transition-all duration-300 hover:scale-[1.02]" 
        onClick={logout} 
        title="Logout"
      >
        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-red-500/10 via-red-500/5 to-red-500/10 opacity-0 group-hover/logout:opacity-100 transition-opacity duration-300" />
        <div className="absolute inset-[1px] rounded-lg bg-card/60 dark:bg-[rgb(var(--card))]/60 backdrop-blur-xl group-hover/logout:bg-card/80 dark:group-hover/logout:bg-[rgb(var(--card))]/80 transition-colors duration-300" />
        <LogOut className="relative h-4 w-4 text-foreground/70 group-hover/logout:text-red-500 dark:group-hover/logout:text-red-400 transition-colors duration-300" />
      </Button>
    </div>
  );
}

export default React.memo(UserMenu);
