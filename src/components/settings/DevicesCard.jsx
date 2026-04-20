import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/auth/AuthProvider.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import Button from "@/components/ui/Button.jsx";
import Badge from "@/components/ui/Badge.jsx";
import { Monitor, LogOut, RefreshCw } from "lucide-react";

export default function DevicesCard() {
  const { t } = useI18n();
  const { listSessions, revokeSession, logoutOtherDevices, logoutAllDevices } = useAuth();

  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [sessErr, setSessErr] = useState("");
  const [sessOk, setSessOk] = useState("");

  const prettyUa = (ua) => {
    const s = String(ua || "").toLowerCase();
    const os = s.includes("windows")
      ? "Windows"
      : s.includes("mac os") || s.includes("macintosh")
      ? "macOS"
      : s.includes("android")
      ? "Android"
      : s.includes("iphone") || s.includes("ipad")
      ? "iOS"
      : s.includes("linux")
      ? "Linux"
      : t("settings.devices.unknown");
    const br = s.includes("edg/")
      ? "Edge"
      : s.includes("chrome/") && !s.includes("chromium")
      ? "Chrome"
      : s.includes("safari/") && !s.includes("chrome/")
      ? "Safari"
      : s.includes("firefox/")
      ? "Firefox"
      : t("settings.devices.browser");
    return `${br} • ${os}`;
  };

  const loadSessions = useCallback(async () => {
    setSessErr("");
    setSessOk("");
    setSessionsLoading(true);
    try {
      const items = await listSessions();
      setSessions(items);
    } catch (e) {
      const isDbError = e?.status === 503 || e?.status === 0;
      if (isDbError) {
        setSessErr(t("common.dbUnavailable") || "Database temporarily unavailable. Please try again.");
      } else {
        setSessErr(e?.message || t("settings.devices.errors.load"));
      }
    } finally {
      setSessionsLoading(false);
    }
  }, [listSessions, t]);

  useEffect(() => {
    loadSessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRevoke = async (sid) => {
    setSessErr("");
    setSessOk("");
    try {
      await revokeSession(sid);
      setSessOk(t("settings.devices.ok.revoked"));
      loadSessions();
    } catch (e) {
      setSessErr(e?.message || t("settings.devices.errors.revoke"));
    }
  };

  const handleLogoutOthers = async () => {
    setSessErr("");
    setSessOk("");
    try {
      await logoutOtherDevices();
      setSessOk(t("settings.devices.ok.otherSignedOut"));
      loadSessions();
    } catch (e) {
      setSessErr(e?.message || t("settings.devices.errors.other"));
    }
  };

  const handleLogoutAll = async () => {
    setSessErr("");
    setSessOk("");
    try {
      await logoutAllDevices();
    } catch (e) {
      setSessErr(e?.message || t("settings.devices.errors.all"));
    }
  };

  return (
    <Card className="premium-panel">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            {t("settings.devices.title")}
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={loadSessions} 
            disabled={sessionsLoading}
            className="h-8 px-2"
          >
            <RefreshCw className={`h-4 w-4 ${sessionsLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{t("settings.devices.subtitle")}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {sessErr && <div className="text-xs text-danger">{sessErr}</div>}
        {sessOk && <div className="text-xs text-success">{sessOk}</div>}

        <div className="space-y-2">
          {sessionsLoading ? (
            <div className="text-xs text-muted-foreground">{t("common.loading")}</div>
          ) : sessions?.length ? (
            sessions.map((s) => (
              <div 
                key={s.sid} 
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{prettyUa(s.ua)}</div>
                  <div className="text-xs text-muted-foreground truncate">{s.ip || "—"}</div>
                  {s.current && (
                    <Badge className="mt-1" variant="secondary">
                      {t("settings.devices.current")}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!s.current && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRevoke(s.sid)}
                      className="h-8"
                    >
                      {t("settings.devices.revoke")}
                    </Button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-xs text-muted-foreground">{t("settings.devices.empty")}</div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleLogoutOthers}
            className="flex-1 sm:flex-none"
          >
            <LogOut className="h-4 w-4" /> 
            {t("settings.devices.signOutOthers")}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleLogoutAll}
            className="flex-1 sm:flex-none"
          >
            {t("settings.devices.signOutAll")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
