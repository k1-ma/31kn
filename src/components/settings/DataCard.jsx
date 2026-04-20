import React, { useState, useRef } from "react";
import { useAuth } from "@/auth/AuthProvider.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import Modal from "@/components/common/Modal.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import Input from "@/components/ui/Input.jsx";
import Button from "@/components/ui/Button.jsx";
import { Download, Upload, Trash2, ShieldAlert, Database } from "lucide-react";

export default function DataCard({ exportJSON, importJSON, resetAll }) {
  const { t } = useI18n();
  const { verifyPassword } = useAuth();
  const fileRef = useRef(null);

  // Reset state
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPw, setResetPw] = useState("");
  const [resetText, setResetText] = useState("");
  const [resetErr, setResetErr] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  const doReset = async () => {
    setResetErr("");
    const phrase = String(resetText || "").trim();
    if (!resetPw) {
      setResetErr(t("settings.data.reset.errors.password"));
      return;
    }
    if (phrase !== "DELETE DATA") {
      setResetErr(t("settings.data.reset.errors.phrase"));
      return;
    }

    setResetBusy(true);
    try {
      await verifyPassword({ password: resetPw });
      resetAll?.();
      setResetOpen(false);
      setResetPw("");
      setResetText("");
    } catch (e) {
      setResetErr(e?.message || t("settings.data.reset.errors.verifyFailed"));
    } finally {
      setResetBusy(false);
    }
  };

  const closeResetModal = () => {
    setResetOpen(false);
    setResetPw("");
    setResetText("");
    setResetErr("");
  };

  return (
    <>
      <Card className="premium-panel">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            {t("settings.data.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Button 
              variant="secondary" 
              onClick={exportJSON}
              className="justify-center"
            >
              <Download className="h-4 w-4" /> 
              {t("settings.data.export")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => fileRef.current?.click()}
              className="justify-center"
            >
              <Upload className="h-4 w-4" /> 
              {t("settings.data.import")}
            </Button>
            <Button
              variant="danger"
              onClick={() => setResetOpen(true)}
              className="justify-center"
            >
              <Trash2 className="h-4 w-4" /> 
              {t("settings.data.reset")}
            </Button>

            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importJSON?.(f);
                e.target.value = "";
              }}
            />
          </div>

          <div className="text-xs text-muted-foreground">{t("settings.data.hint")}</div>
        </CardContent>
      </Card>

      {/* Reset confirmation modal */}
      <Modal 
        open={resetOpen} 
        onOpenChange={(open) => !open && closeResetModal()} 
        title={t("settings.data.resetTitle")}
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-border bg-danger/10 p-4">
            <div className="mt-0.5 h-10 w-10 rounded-xl border border-border bg-danger/15 flex items-center justify-center shrink-0">
              <ShieldAlert className="h-5 w-5 text-danger" />
            </div>
            <div>
              <div className="text-sm font-semibold">{t("settings.data.resetWarningTitle")}</div>
              <div className="mt-1 text-xs text-muted-foreground">{t("settings.data.resetWarning")}</div>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold mb-1.5 block">
              {t("settings.data.resetPassword")}
            </label>
            <Input 
              type="password" 
              value={resetPw} 
              onChange={(e) => setResetPw(e.target.value)} 
              placeholder="••••••••" 
            />
          </div>

          <div>
            <label className="text-xs font-semibold mb-1.5 block">
              {t("settings.data.resetPhraseLabel")}
            </label>
            <Input 
              value={resetText} 
              onChange={(e) => setResetText(e.target.value)} 
              placeholder="DELETE DATA" 
            />
            <div className="mt-1 text-xs text-muted-foreground">{t("settings.data.resetPhraseHint")}</div>
          </div>

          {resetErr && <div className="text-xs text-danger">{resetErr}</div>}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeResetModal}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" onClick={doReset} disabled={resetBusy}>
              {resetBusy ? t("common.working") : t("settings.data.resetConfirm")}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
