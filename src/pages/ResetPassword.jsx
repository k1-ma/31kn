import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { apiJson } from "@/lib/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import PasswordInput from "@/components/ui/PasswordInput.jsx";
import Button from "@/components/ui/Button.jsx";
import hauntedLogo from "@/assets/haunted.png";
import { Lock, ArrowLeft, CheckCircle, XCircle, Loader2, Key } from "lucide-react";

export default function ResetPassword() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState("validating"); // validating | form | resetting | success | error
  const [username, setUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [err, setErr] = useState("");
  const [tokenError, setTokenError] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setTokenError(t("auth.resetPassword.errors.noToken") || "No reset token provided");
      return;
    }

    validateToken();
  }, [token]);

  const validateToken = async () => {
    setStatus("validating");
    try {
      const result = await apiJson("/api/auth/validate-reset-token", {
        method: "POST",
        body: { token },
      });
      
      if (result.valid) {
        setUsername(result.username || "");
        setStatus("form");
      } else {
        setStatus("error");
        setTokenError(t("auth.resetPassword.errors.tokenInvalid") || "Invalid reset token");
      }
    } catch (e) {
      setStatus("error");
      const errorCode = e?.data?.errorCode || e?.code;
      
      if (errorCode === "TOKEN_EXPIRED") {
        setTokenError(t("auth.resetPassword.errors.tokenExpired") || "This reset link has expired. Please request a new one.");
      } else if (errorCode === "TOKEN_USED") {
        setTokenError(t("auth.resetPassword.errors.tokenUsed") || "This reset link has already been used.");
      } else if (errorCode === "TOKEN_INVALID") {
        setTokenError(t("auth.resetPassword.errors.tokenInvalid") || "Invalid reset link.");
      } else {
        setTokenError(e?.message || t("auth.resetPassword.errors.validationFailed") || "Failed to validate reset link.");
      }
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");

    if (newPassword.length < 8) {
      setErr(t("auth.resetPassword.errors.passwordTooShort") || "Password must be at least 8 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErr(t("auth.resetPassword.errors.passwordMismatch") || "Passwords do not match");
      return;
    }

    setStatus("resetting");
    try {
      await apiJson("/api/auth/reset-password", {
        method: "POST",
        body: { token, newPassword },
      });
      setStatus("success");
    } catch (e) {
      setStatus("form");
      const errorCode = e?.data?.errorCode || e?.code;
      
      if (errorCode === "TOKEN_EXPIRED") {
        setErr(t("auth.resetPassword.errors.tokenExpired") || "This reset link has expired. Please request a new one.");
      } else {
        setErr(e?.message || t("auth.resetPassword.errors.resetFailed") || "Failed to reset password. Please try again.");
      }
    }
  };

  const renderContent = () => {
    switch (status) {
      case "validating":
        return (
          <>
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
              className="h-16 w-16 mx-auto mb-4"
            >
              <Loader2 className="h-16 w-16 text-accent" />
            </motion.div>
            <CardTitle className="text-2xl font-bold text-center">
              {t("auth.resetPassword.validating") || "Validating reset link..."}
            </CardTitle>
            <p className="text-sm text-muted-foreground text-center mt-2">
              {t("auth.resetPassword.pleaseWait") || "Please wait a moment"}
            </p>
          </>
        );

      case "form":
        return (
          <>
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="h-16 w-16 mx-auto mb-4 rounded-full bg-accent/20 flex items-center justify-center"
            >
              <Key className="h-8 w-8 text-accent" />
            </motion.div>
            <CardTitle className="text-2xl font-bold text-center">
              {t("auth.resetPassword.title") || "Reset Password"}
            </CardTitle>
            {username && (
              <p className="text-sm text-muted-foreground text-center mt-2">
                {t("auth.resetPassword.forUser") || "For account"}: <span className="text-accent font-medium">{username}</span>
              </p>
            )}
            
            <form onSubmit={onSubmit} className="space-y-4 mt-6">
              <div className="space-y-1">
                <div className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" />
                  {t("auth.resetPassword.newPasswordLabel") || "New Password"}
                </div>
                <PasswordInput 
                  value={newPassword} 
                  onChange={(e) => setNewPassword(e.target.value)} 
                  autoComplete="new-password"
                  className="h-10 rounded-lg border-2 bg-background/50 focus:border-accent/50 focus:ring-4 focus:ring-accent/10 transition-all"
                />
              </div>

              <div className="space-y-1">
                <div className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" />
                  {t("auth.resetPassword.confirmPasswordLabel") || "Confirm New Password"}
                </div>
                <PasswordInput 
                  value={confirmPassword} 
                  onChange={(e) => setConfirmPassword(e.target.value)} 
                  autoComplete="new-password"
                  className="h-10 rounded-lg border-2 bg-background/50 focus:border-accent/50 focus:ring-4 focus:ring-accent/10 transition-all"
                />
              </div>

              {err ? (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-sm text-danger bg-danger/10 p-3 rounded-xl border border-danger/20"
                >
                  {err}
                </motion.div>
              ) : null}

              <Button 
                disabled={status === "resetting"} 
                className="w-full h-10 rounded-lg text-base font-semibold"
              >
                {status === "resetting" ? (
                  <span className="flex items-center gap-2">
                    <motion.span 
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full"
                    />
                    {t("auth.resetPassword.resetting") || "Resetting..."}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    {t("auth.resetPassword.resetButton") || "Reset Password"}
                  </span>
                )}
              </Button>
            </form>

            <div className="mt-4 rounded-xl border border-accent/20 bg-accent/5 p-3 text-xs text-muted-foreground">
              <p>
                ⚠️ {t("auth.resetPassword.warning") || "After resetting your password, all your active sessions will be logged out for security."}
              </p>
            </div>
          </>
        );

      case "success":
        return (
          <>
            <motion.div 
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
              className="h-16 w-16 mx-auto mb-4 rounded-full bg-success/20 flex items-center justify-center"
            >
              <CheckCircle className="h-10 w-10 text-success" />
            </motion.div>
            <CardTitle className="text-2xl font-bold text-center text-success">
              {t("auth.resetPassword.success.title") || "Password Reset!"}
            </CardTitle>
            <p className="text-sm text-muted-foreground text-center mt-2">
              {t("auth.resetPassword.success.message") || "Your password has been successfully reset. All active sessions have been logged out."}
            </p>
            <div className="mt-6">
              <Link to="/login">
                <Button className="w-full h-10 rounded-lg">
                  {t("auth.resetPassword.goToLogin") || "Go to Login"}
                </Button>
              </Link>
            </div>
          </>
        );

      case "error":
        return (
          <>
            <motion.div 
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="h-16 w-16 mx-auto mb-4 rounded-full bg-danger/20 flex items-center justify-center"
            >
              <XCircle className="h-10 w-10 text-danger" />
            </motion.div>
            <CardTitle className="text-2xl font-bold text-center text-danger">
              {t("auth.resetPassword.error.title") || "Invalid Reset Link"}
            </CardTitle>
            <p className="text-sm text-muted-foreground text-center mt-2">
              {tokenError}
            </p>
            <div className="mt-6 space-y-3">
              <Link to="/forgot-password">
                <Button className="w-full h-10 rounded-lg">
                  {t("auth.resetPassword.requestNewLink") || "Request New Link"}
                </Button>
              </Link>
              <Link to="/login">
                <Button variant="outline" className="w-full h-10 rounded-lg">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {t("auth.resetPassword.backToLogin") || "Back to Login"}
                </Button>
              </Link>
            </div>
          </>
        );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Haunted background effects */}
      <div className="pointer-events-none fixed inset-0 grid-overlay opacity-[0.15]" />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-br from-[#3B82F6]/6 via-transparent to-[#22D3EE]/4" />
      
      <div className="pointer-events-none fixed top-1/4 left-1/4 w-[600px] h-[600px] bg-gradient-to-r from-accent/10 to-accent-2/8 dark:from-accent/15 dark:to-accent-2/10 rounded-full blur-[150px] opacity-40 animate-pulse" />
      <div className="pointer-events-none fixed bottom-1/4 right-1/4 w-[500px] h-[500px] bg-gradient-to-r from-accent-2/8 to-accent/8 dark:from-accent-2/10 dark:to-accent/10 rounded-full blur-[120px] opacity-30 animate-pulse" style={{ animationDelay: '1s' }} />

      <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.95 }} 
        animate={{ opacity: 1, y: 0, scale: 1 }} 
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative w-full max-w-md z-10"
      >
        <Card className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card/90 dark:bg-[#131722]/70 backdrop-blur-xl shadow-lg">
          <CardHeader className="pb-4 pt-8">
            <div className="flex flex-col items-center gap-4 text-center">
              <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="relative"
              >
                <div className="absolute inset-0 bg-[#3B82F6]/40 rounded-xl blur-xl" />
                <img src={hauntedLogo} alt="Haunted" className="relative h-16 w-16" />
              </motion.div>
            </div>
          </CardHeader>

          <CardContent className="pb-8">
            {renderContent()}
          </CardContent>
        </Card>
        
        <div className="mt-6 flex justify-center">
          <div className="h-[1px] w-20 rounded-full bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
        </div>
      </motion.div>
    </div>
  );
}
