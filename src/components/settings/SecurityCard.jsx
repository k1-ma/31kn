import React, { useState } from "react";
import { useAuth } from "@/auth/AuthProvider.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import Modal from "@/components/common/Modal.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import Input from "@/components/ui/Input.jsx";
import Button from "@/components/ui/Button.jsx";
import Badge from "@/components/ui/Badge.jsx";
import { Shield, AlertTriangle, Check, Copy } from "lucide-react";

export default function SecurityCard() {
  const { t } = useI18n();
  const { user, changePassword, setup2fa, enable2fa, disable2fa } = useAuth();

  // Password state
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [secErr, setSecErr] = useState("");
  const [secOk, setSecOk] = useState("");

  // 2FA State
  const [twofaStep, setTwofaStep] = useState(null);
  const [twofaQr, setTwofaQr] = useState("");
  const [twofaOtpauth, setTwofaOtpauth] = useState("");
  const [twofaCode, setTwofaCode] = useState("");
  const [twofaBackupCodes, setTwofaBackupCodes] = useState([]);
  const [twofaErr, setTwofaErr] = useState("");
  const [twofaBusy, setTwofaBusy] = useState(false);
  const [twofaDisablePassword, setTwofaDisablePassword] = useState("");
  const [twofaCopied, setTwofaCopied] = useState(false);

  // Password handlers
  const onChangePw = async () => {
    setSecErr("");
    setSecOk("");
    if (!oldPw || !newPw) {
      setSecErr(t("settings.security.errors.fillBoth"));
      return;
    }
    if (newPw.length < 8) {
      setSecErr(t("settings.security.errors.tooShort"));
      return;
    }
    try {
      await changePassword({ oldPassword: oldPw, newPassword: newPw });
      setOldPw("");
      setNewPw("");
      setSecOk(t("settings.security.ok.passwordChanged"));
    } catch (e) {
      setSecErr(e?.message || t("settings.security.errors.changeFailed"));
    }
  };

  const clearPasswordFields = () => {
    setOldPw("");
    setNewPw("");
    setSecErr("");
    setSecOk("");
  };

  // 2FA handlers
  const startTwofaSetup = async () => {
    setTwofaErr("");
    setTwofaBusy(true);
    try {
      const result = await setup2fa();
      if (result?.error) {
        setTwofaErr(result.error);
        setTwofaBusy(false);
        return;
      }
      setTwofaQr(result.qr_data_url);
      setTwofaOtpauth(result.otpauth_url);
      setTwofaStep("setup");
    } catch (e) {
      setTwofaErr(e?.message || t("settings.security.2fa.errors.setupFailed") || "Failed to setup 2FA");
    } finally {
      setTwofaBusy(false);
    }
  };

  const confirmTwofaEnable = async () => {
    if (!twofaCode || twofaCode.length < 6) {
      setTwofaErr(t("settings.security.2fa.errors.invalidCode") || "Enter a valid 6-digit code");
      return;
    }
    setTwofaErr("");
    setTwofaBusy(true);
    try {
      const result = await enable2fa(twofaCode);
      if (result?.error) {
        setTwofaErr(result.error);
        setTwofaBusy(false);
        return;
      }
      setTwofaBackupCodes(result.backup_codes || []);
      setTwofaStep("backup");
      setTwofaCode("");
    } catch (e) {
      setTwofaErr(e?.message || t("settings.security.2fa.errors.enableFailed") || "Failed to enable 2FA");
    } finally {
      setTwofaBusy(false);
    }
  };

  const openDisable2fa = () => {
    setTwofaStep("disable");
    setTwofaCode("");
    setTwofaDisablePassword("");
    setTwofaErr("");
  };

  const confirmTwofaDisable = async () => {
    if (!twofaDisablePassword || !twofaCode) {
      setTwofaErr(t("settings.security.2fa.errors.passwordAndCodeRequired") || "Password and 2FA code required");
      return;
    }
    setTwofaErr("");
    setTwofaBusy(true);
    try {
      const result = await disable2fa(twofaDisablePassword, twofaCode);
      if (result?.error) {
        setTwofaErr(result.error);
        setTwofaBusy(false);
        return;
      }
      closeTwofaModal();
    } catch (e) {
      setTwofaErr(e?.message || t("settings.security.2fa.errors.disableFailed") || "Failed to disable 2FA");
    } finally {
      setTwofaBusy(false);
    }
  };

  const closeTwofaModal = () => {
    setTwofaStep(null);
    setTwofaQr("");
    setTwofaOtpauth("");
    setTwofaCode("");
    setTwofaBackupCodes([]);
    setTwofaErr("");
    setTwofaDisablePassword("");
    setTwofaCopied(false);
  };

  const copyBackupCodes = async () => {
    try {
      await navigator.clipboard.writeText(twofaBackupCodes.join("\n"));
      setTwofaCopied(true);
      setTimeout(() => setTwofaCopied(false), 2000);
    } catch {}
  };

  return (
    <>
      <Card className="premium-panel">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t("settings.security.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Password Section */}
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">{t("settings.security.note")}</div>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold mb-1.5 block">
                  {t("settings.security.currentPassword")}
                </label>
                <Input 
                  type="password" 
                  value={oldPw} 
                  onChange={(e) => setOldPw(e.target.value)} 
                  placeholder="••••••••" 
                />
              </div>
              <div>
                <label className="text-xs font-semibold mb-1.5 block">
                  {t("settings.security.newPassword")}
                </label>
                <Input 
                  type="password" 
                  value={newPw} 
                  onChange={(e) => setNewPw(e.target.value)} 
                  placeholder="••••••••" 
                />
              </div>
            </div>
            
            {secErr && <div className="text-xs text-danger">{secErr}</div>}
            {secOk && <div className="text-xs text-success">{secOk}</div>}
            
            {/* Password buttons - aligned right on desktop, stacked on mobile */}
            <div className="flex flex-col sm:flex-row gap-2 sm:justify-end pt-1">
              <Button 
                variant="secondary" 
                size="sm"
                onClick={clearPasswordFields}
                className="sm:order-1"
              >
                {t("common.clear")}
              </Button>
              <Button 
                size="sm"
                onClick={onChangePw}
                className="sm:order-2"
              >
                {t("settings.security.changePassword")}
              </Button>
            </div>
          </div>

          {/* Separator */}
          <div className="border-t border-border/50" />

          {/* 2FA Section */}
          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                  <Shield className="h-5 w-5 text-accent" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">
                      {t("settings.security.2fa.title") || "Two-Factor Authentication"}
                    </span>
                    {user?.twofa_enabled && (
                      <Badge variant="success" className="whitespace-nowrap">
                        {t("settings.security.2fa.active") || "Active"}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {user?.twofa_enabled 
                      ? (t("settings.security.2fa.enabled") || "2FA is enabled for your account")
                      : (t("settings.security.2fa.disabled") || "Add an extra layer of security")
                    }
                  </div>
                </div>
              </div>
              <div className="sm:shrink-0">
                {user?.twofa_enabled ? (
                  <Button 
                    variant="danger" 
                    size="sm"
                    onClick={openDisable2fa} 
                    disabled={twofaBusy}
                    className="w-full sm:w-auto"
                  >
                    {t("settings.security.2fa.disableButton") || "Disable 2FA"}
                  </Button>
                ) : (
                  <Button 
                    size="sm"
                    onClick={startTwofaSetup} 
                    disabled={twofaBusy}
                    className="w-full sm:w-auto"
                  >
                    {t("settings.security.2fa.enableButton") || "Enable 2FA"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2FA Setup Modal */}
      <Modal 
        open={twofaStep === "setup"} 
        onOpenChange={(open) => !open && closeTwofaModal()}
        title={t("settings.security.2fa.setupTitle") || "Set Up Two-Factor Authentication"}
        size="sm"
      >
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            {t("settings.security.2fa.setupInstruction") || "Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)"}
          </div>
          
          {twofaQr && (
            <div className="flex justify-center">
              <div className="rounded-xl border border-border bg-white p-3">
                <img src={twofaQr} alt="2FA QR Code" className="h-48 w-48" />
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <div className="text-xs text-muted-foreground mb-1">
              {t("settings.security.2fa.manualEntry") || "Can't scan? Enter this code manually:"}
            </div>
            <div className="font-mono text-sm break-all select-all">
              {twofaOtpauth?.split("secret=")[1]?.split("&")[0] || ""}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold mb-1.5 block">
              {t("settings.security.2fa.verifyCode") || "Enter the 6-digit code from your app"}
            </label>
            <Input 
              value={twofaCode} 
              onChange={(e) => setTwofaCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
              placeholder="000000"
              className="text-center text-xl tracking-widest font-mono"
              autoFocus
            />
          </div>

          {twofaErr && <div className="text-xs text-danger">{twofaErr}</div>}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeTwofaModal}>{t("common.cancel")}</Button>
            <Button onClick={confirmTwofaEnable} disabled={twofaBusy || twofaCode.length < 6}>
              {twofaBusy ? t("common.working") : (t("settings.security.2fa.verify") || "Verify & Enable")}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 2FA Backup Codes Modal */}
      <Modal 
        open={twofaStep === "backup"} 
        onOpenChange={(open) => !open && closeTwofaModal()}
        title={t("settings.security.2fa.backupCodesTitle") || "Save Your Backup Codes"}
        size="sm"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-success/30 bg-success/10 p-3">
            <div className="flex items-start gap-2">
              <Check className="h-5 w-5 text-success mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-success">
                  {t("settings.security.2fa.enabled") || "Two-factor authentication is now enabled!"}
                </div>
              </div>
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            {t("settings.security.2fa.backupCodesInstruction") || "Save these backup codes in a safe place. You can use each code once if you lose access to your authenticator app."}
          </div>
          
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="grid grid-cols-2 gap-2 font-mono text-sm">
              {twofaBackupCodes.map((code, idx) => (
                <div key={idx} className="rounded-lg bg-card/50 p-2 text-center">
                  {code}
                </div>
              ))}
            </div>
          </div>

          <Button onClick={copyBackupCodes} variant="secondary" className="w-full">
            {twofaCopied ? (
              <>
                <Check className="h-4 w-4" /> {t("common.copied") || "Copied!"}
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" /> {t("settings.security.2fa.copyBackupCodes") || "Copy Backup Codes"}
              </>
            )}
          </Button>

          <div className="text-xs text-muted-foreground text-center">
            {t("settings.security.2fa.backupCodesWarning") || "These codes will only be shown once. Make sure to save them now."}
          </div>

          <div className="flex justify-end">
            <Button onClick={closeTwofaModal}>
              {t("common.done") || "Done"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 2FA Disable Modal */}
      <Modal 
        open={twofaStep === "disable"} 
        onOpenChange={(open) => !open && closeTwofaModal()}
        title={t("settings.security.2fa.disableTitle") || "Disable Two-Factor Authentication"}
        size="sm"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-danger/30 bg-danger/10 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-danger mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-danger">
                  {t("settings.security.2fa.disableWarning") || "This will make your account less secure"}
                </div>
                <div className="text-xs text-danger/80 mt-1">
                  {t("settings.security.2fa.disableWarningDetail") || "Anyone with your password will be able to access your account."}
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold mb-1.5 block">
              {t("settings.security.2fa.enterPassword") || "Enter your password"}
            </label>
            <Input 
              type="password"
              value={twofaDisablePassword} 
              onChange={(e) => setTwofaDisablePassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <div>
            <label className="text-xs font-semibold mb-1.5 block">
              {t("settings.security.2fa.enterCode") || "Enter 2FA code or backup code"}
            </label>
            <Input 
              value={twofaCode} 
              onChange={(e) => setTwofaCode(e.target.value.replace(/[^0-9A-Za-z]/g, ""))}
              placeholder="000000"
              className="text-center tracking-widest font-mono"
            />
          </div>

          {twofaErr && <div className="text-xs text-danger">{twofaErr}</div>}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeTwofaModal}>{t("common.cancel")}</Button>
            <Button variant="danger" onClick={confirmTwofaDisable} disabled={twofaBusy || !twofaDisablePassword || !twofaCode}>
              {twofaBusy ? t("common.working") : (t("settings.security.2fa.disableConfirm") || "Disable 2FA")}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
