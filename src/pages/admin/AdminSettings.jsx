import React, { useEffect, useState } from "react";
import { apiJson } from "@/lib/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import Switch from "@/components/ui/Switch.jsx";
import Button from "@/components/ui/Button.jsx";
import ToastViewport from "@/components/common/ToastViewport.jsx";
import { useToasts } from "@/components/common/toast.js";
import AdminLayout from "./AdminLayout.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { SUPPORTED_LANGS } from "@/i18n/translations.js";
import { Settings, UserPlus, RefreshCcw, Globe, Check } from "lucide-react";
import { motion } from "framer-motion";

export default function AdminSettings() {
  const { t, lang, setLang } = useI18n();
  const toast = useToasts();
  
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiJson("/api/admin/settings");
      setSettings(data);
    } catch (e) {
      setError(e?.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const toggleRegistration = async (enabled) => {
    setSaving(true);
    try {
      const result = await apiJson("/api/admin/settings", {
        method: "PUT",
        body: { registrationEnabled: enabled },
      });
      setSettings({ ...settings, registrationEnabled: result.registrationEnabled });
      toast.push({
        title: t("common.done"),
        description: enabled 
          ? (t("admin.pages.settings.toasts.registrationEnabled", null, "Registration enabled"))
          : (t("admin.pages.settings.toasts.registrationDisabled", null, "Registration disabled")),
        tone: "success",
      });
    } catch (e) {
      toast.push({ title: t("common.error"), description: e?.message || "Failed to update settings", tone: "danger" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminLayout
      title={t("admin.nav.settings", null, "Settings")}
      subtitle={t("admin.pages.settings.subtitle", null, "Manage system settings")}
      actions={
        <Button variant="ghost" className="rounded-xl" onClick={loadSettings} title={t("common.refresh")}>
          <RefreshCcw className="h-4 w-4" />
        </Button>
      }
    >
        {/* Error message */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
            {error}
          </div>
        )}

        {/* Settings Card */}
        <Card className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm shadow-xl shadow-black/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              {t("admin.pages.settings.title", null, "System Settings")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
            ) : (
              <>
                {/* Registration Toggle */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/10 p-4 hover:bg-muted/20 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-background/30 flex items-center justify-center">
                      <UserPlus className="h-5 w-5 text-[#3B82F6]" />
                    </div>
                    <div>
                      <div className="font-medium">{t("admin.pages.settings.registration.title", null, "User Registration")}</div>
                      <div className="text-xs text-muted-foreground">
                        {t("admin.pages.settings.registration.description", null, "Allow new users to register on the site")}
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={!!settings?.registrationEnabled}
                    onCheckedChange={toggleRegistration}
                    disabled={saving}
                  />
                </motion.div>

                {/* Language Switcher */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className="rounded-xl border border-border/50 bg-muted/10 p-4 hover:bg-muted/20 transition"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-xl bg-background/30 flex items-center justify-center">
                      <Globe className="h-5 w-5 text-purple-500" />
                    </div>
                    <div>
                      <div className="font-medium">{t("admin.pages.settings.language.title", null, "Admin Panel Language")}</div>
                      <div className="text-xs text-muted-foreground">
                        {t("admin.pages.settings.language.description", null, "Change the display language of the admin panel")}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {SUPPORTED_LANGS.map((l) => (
                      <button
                        key={l.id}
                        onClick={() => setLang(l.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                          lang === l.id
                            ? "bg-accent text-[rgb(var(--on-accent))] shadow-sm"
                            : "bg-muted/20 hover:bg-muted/40 text-muted-foreground"
                        }`}
                      >
                        {l.label}
                        {lang === l.id && <Check className="h-3.5 w-3.5" />}
                      </button>
                    ))}
                  </div>
                </motion.div>

                <div className="text-xs text-muted-foreground pt-2">
                  {t("admin.pages.settings.note", null, "Note: These settings apply only during the current server session. To persist settings, configure environment variables.")}
                </div>
              </>
            )}
          </CardContent>
        </Card>

      <ToastViewport toasts={toast.toasts} onClose={toast.remove} />
    </AdminLayout>
  );
}
