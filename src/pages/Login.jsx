import React, { useState, useEffect } from "react";
import { Navigate, useLocation, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/auth/AuthProvider.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { apiJson } from "@/lib/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import Input from "@/components/ui/Input.jsx";
import PasswordInput from "@/components/ui/PasswordInput.jsx";
import Button from "@/components/ui/Button.jsx";
import Switch from "@/components/ui/Switch.jsx";
import TelegramLink from "@/components/common/TelegramLink.jsx";
import LanguageSwitcher from "@/components/common/LanguageSwitcher.jsx";
import hauntedLogo from "@/assets/haunted.png";
import { LogIn, Lock, User, Shield, ArrowLeft, Mail, RefreshCw } from "lucide-react";

export default function Login() {
  const { t } = useI18n();
  const { user, login, verify2faLogin } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [err, setErr] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(false);

  // 2FA state
  const [twofaStep, setTwofaStep] = useState(false);
  const [twofaTicket, setTwofaTicket] = useState("");
  const [twofaCode, setTwofaCode] = useState("");

  // Email verification state
  const [emailVerifyStep, setEmailVerifyStep] = useState(false);
  const [emailVerifyUserId, setEmailVerifyUserId] = useState(null);
  const [emailVerifyAddress, setEmailVerifyAddress] = useState("");
  const [resendBusy, setResendBusy] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const from = loc.state?.from?.pathname || "/app";

  // Handle OAuth error parameters, 2FA redirect, and registration success
  useEffect(() => {
    const params = new URLSearchParams(loc.search);
    const error = params.get("error");
    const twofa = params.get("twofa");
    const ticket = params.get("ticket");
    const registered = params.get("registered");

    // Handle successful registration with email verification required
    if (registered === "1") {
      setSuccessMsg(t("auth.login.registeredSuccess") || "Account created! Please check your email to verify your account.");
      // Clear the params from URL
      window.history.replaceState({}, document.title, loc.pathname);
      return;
    }

    // Handle 2FA redirect from Google OAuth
    if (twofa === "1" && ticket) {
      setTwofaStep(true);
      setTwofaTicket(ticket);
      // Clear the params from URL
      window.history.replaceState({}, document.title, loc.pathname);
      return;
    }

    if (error) {
      // Map error codes to user-friendly messages
      const errorMessages = {
        oauth_not_configured: t("auth.login.errors.googleNotConfigured") || "Google sign-in is not configured",
        invalid_state: t("auth.login.errors.googleInvalidState") || "Session expired. Please try again.",
        no_code: t("auth.login.errors.googleNoCode") || "Google sign-in was cancelled",
        token_exchange_failed: t("auth.login.errors.googleTokenFailed") || "Failed to complete Google sign-in",
        userinfo_failed: t("auth.login.errors.googleUserInfoFailed") || "Failed to get Google account info",
        session_failed: t("auth.login.errors.googleSessionFailed") || "Failed to create session",
        oauth_error: t("auth.login.errors.googleOAuthError") || "Google sign-in failed",
        // New error codes
        db_unavailable: t("auth.login.errors.dbUnavailable") || "Server database is unavailable. Please try again later.",
        redirect_uri_mismatch: t("auth.login.errors.redirectUriMismatch") || "Google OAuth redirect URL mismatch. Contact support.",
        invalid_grant: t("auth.login.errors.invalidGrant") || "Authorization expired. Please try again.",
        google_denied: t("auth.login.errors.googleDenied") || "Access was denied. Please try again.",
        "2fa_challenge_failed": t("auth.login.errors.2faChallengeFailed") || "Failed to create 2FA challenge. Please try again.",
      };
      setErr(errorMessages[error] || t("auth.login.errors.googleOAuthError") || "Google sign-in failed");
      // Clear the error from URL without triggering a navigation
      window.history.replaceState({}, document.title, loc.pathname);
    }
  }, [loc.search, loc.pathname, t]);

  useEffect(() => {
    // Check if Google OAuth is available
    apiJson("/api/auth/google/status")
      .then((res) => {
        const available = res?.available ?? false;
        setGoogleAvailable(available);
        if (!available) {
          // eslint-disable-next-line no-console
          console.info("[Login] Google OAuth disabled: server returned available=false (check GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URL env vars)");
        }
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("[Login] Google OAuth status check failed:", err?.message || err);
        setGoogleAvailable(false);
      });
    
    // Check if registration is enabled
    apiJson("/api/auth/registration-status")
      .then((res) => setRegistrationEnabled(res?.enabled ?? false))
      .catch(() => setRegistrationEnabled(false));
  }, []);

  if (user) return <Navigate to={from} replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const result = await login({ username, password, remember });
      
      // Check if 2FA is required
      if (result?.requires2fa) {
        setTwofaStep(true);
        setTwofaTicket(result.ticket);
        setPassword(""); // Clear password for security
        setBusy(false);
        return;
      }

      if (!result?.user) throw new Error(t("auth.login.errors.noUser"));
      nav(from, { replace: true });
    } catch (e2) {
      // Check for email not verified error
      const errorCode = e2?.data?.errorCode || e2?.code;
      if (errorCode === "EMAIL_NOT_VERIFIED") {
        setEmailVerifyStep(true);
        setEmailVerifyUserId(e2?.data?.userId);
        setEmailVerifyAddress(e2?.data?.email || "");
        setPassword(""); // Clear password for security
        setBusy(false);
        return;
      }
      
      const msg = e2?.message;
      setErr(msg && msg !== "Error" ? msg : t("auth.login.errors.failed"));
    } finally {
      setBusy(false);
    }
  };

  const on2faSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const u = await verify2faLogin(twofaTicket, twofaCode);
      if (!u) throw new Error(t("auth.login.errors.noUser"));
      nav(from, { replace: true });
    } catch (e2) {
      const msg = e2?.message;
      setErr(msg && msg !== "Error" ? msg : t("auth.login.errors.invalid2faCode") || "Invalid 2FA code");
    } finally {
      setBusy(false);
    }
  };

  const goBackToLogin = () => {
    setTwofaStep(false);
    setTwofaTicket("");
    setTwofaCode("");
    setEmailVerifyStep(false);
    setEmailVerifyUserId(null);
    setEmailVerifyAddress("");
    setResendSuccess(false);
    setErr("");
  };

  const onResendVerification = async () => {
    if (!emailVerifyUserId) return;
    setResendBusy(true);
    setErr("");
    try {
      await apiJson("/api/auth/resend-verification", {
        method: "POST",
        body: { userId: emailVerifyUserId },
      });
      setResendSuccess(true);
    } catch (e2) {
      const msg = e2?.message;
      setErr(msg && msg !== "Error" ? msg : t("auth.login.errors.resendFailed") || "Failed to resend email");
    } finally {
      setResendBusy(false);
    }
  };

  // Email verification required UI
  if (emailVerifyStep) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: 'rgb(var(--bg))' }}>
        {/* Haunted background effects */}
        <div className="pointer-events-none fixed inset-0 grid-overlay opacity-[0.15]" />
        <div className="pointer-events-none fixed inset-0" style={{ background: `radial-gradient(ellipse 70% 50% at 50% 40%, rgba(30,58,138,0.10) 0%, transparent 70%), radial-gradient(600px circle at 5% 10%, rgba(59,130,246,0.06) 0%, transparent 60%), rgb(var(--bg))` }} />

        {/* Language switcher */}
        <div className="fixed top-4 right-4 z-20">
          <LanguageSwitcher />
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20, scale: 0.95 }} 
          animate={{ opacity: 1, y: 0, scale: 1 }} 
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="relative w-full max-w-md z-10"
        >
          <Card className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card/95 dark:bg-[#131722]/70 backdrop-blur-xl shadow-lg dark:shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
            <CardHeader className="pb-4 pt-8">
              <div className="flex flex-col items-center gap-4 text-center">
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="relative"
                >
                  <div className="h-16 w-16 rounded-full bg-amber-500/20 flex items-center justify-center">
                    <Mail className="h-8 w-8 text-amber-500" />
                  </div>
                </motion.div>
                
                <div>
                  <CardTitle className="text-2xl font-bold text-foreground">
                    {t("auth.login.emailVerify.title") || "Verify Your Email"}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-2">
                    {t("auth.login.emailVerify.subtitle") || "Please verify your email address to continue"}
                  </p>
                  {emailVerifyAddress && (
                    <p className="text-sm text-accent mt-2 font-medium">
                      {emailVerifyAddress}
                    </p>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className="pb-8">
              <div className="space-y-4">
                {resendSuccess ? (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm text-success bg-success/10 p-4 rounded-xl border border-success/20 text-center"
                  >
                    {t("auth.login.emailVerify.resendSuccess") || "Verification email sent! Check your inbox."}
                  </motion.div>
                ) : (
                  <>
                    <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 text-sm text-muted-foreground">
                      <p className="mb-2">
                        {t("auth.login.emailVerify.message") || "We've sent a verification link to your email. Please click the link to verify your account."}
                      </p>
                      <ul className="list-disc list-inside space-y-1 text-xs mt-3">
                        <li>{t("auth.login.emailVerify.tip1") || "Check your spam/junk folder"}</li>
                        <li>{t("auth.login.emailVerify.tip2") || "The link expires in 24 hours"}</li>
                      </ul>
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
                      onClick={onResendVerification}
                      disabled={resendBusy}
                      className="w-full h-10 rounded-lg"
                    >
                      {resendBusy ? (
                        <span className="flex items-center gap-2">
                          <motion.span 
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                            className="inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full"
                          />
                          {t("auth.login.emailVerify.sending") || "Sending..."}
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <RefreshCw className="h-4 w-4" />
                          {t("auth.login.emailVerify.resend") || "Resend Verification Email"}
                        </span>
                      )}
                    </Button>
                  </>
                )}

                <Button 
                  type="button"
                  variant="ghost"
                  onClick={goBackToLogin}
                  className="w-full"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {t("auth.login.emailVerify.back") || "Back to login"}
                </Button>
              </div>
            </CardContent>
          </Card>
          
          <div className="mt-6 flex justify-center">
            <div className="h-[1px] w-20 rounded-full bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
          </div>
        </motion.div>
      </div>
    );
  }

  // 2FA Step UI
  if (twofaStep) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: 'rgb(var(--bg))' }}>
        {/* Haunted background effects */}
        <div className="pointer-events-none fixed inset-0 grid-overlay opacity-[0.15]" />
        <div className="pointer-events-none fixed inset-0" style={{ background: `radial-gradient(ellipse 70% 50% at 50% 40%, rgba(30,58,138,0.10) 0%, transparent 70%), radial-gradient(600px circle at 5% 10%, rgba(59,130,246,0.06) 0%, transparent 60%), rgb(var(--bg))` }} />

        {/* Language switcher */}
        <div className="fixed top-4 right-4 z-20">
          <LanguageSwitcher />
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20, scale: 0.95 }} 
          animate={{ opacity: 1, y: 0, scale: 1 }} 
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="relative w-full max-w-md z-10"
        >
          <Card className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card/95 dark:bg-[#131722]/70 backdrop-blur-xl shadow-lg dark:shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
            <CardHeader className="pb-4 pt-8">
              <div className="flex flex-col items-center gap-4 text-center">
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="relative"
                >
                  <div className="h-16 w-16 rounded-full bg-accent/20 flex items-center justify-center">
                    <Shield className="h-8 w-8 text-accent" />
                  </div>
                </motion.div>
                
                <div>
                  <CardTitle className="text-2xl font-bold text-foreground">
                    {t("auth.login.2fa.title") || "Two-Factor Authentication"}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-2">
                    {t("auth.login.2fa.subtitle") || "Enter the 6-digit code from your authenticator app or a backup code"}
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pb-8">
              <form onSubmit={on2faSubmit} className="space-y-4">
                <div className="space-y-1">
                  <div className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5" />
                    {t("auth.login.2fa.codeLabel") || "Authentication Code"}
                  </div>
                  <Input 
                    value={twofaCode} 
                    onChange={(e) => setTwofaCode(e.target.value.replace(/[^0-9A-Za-z]/g, ""))}
                    placeholder="123456"
                    autoComplete="one-time-code"
                    autoFocus
                    className="h-12 rounded-xl border border-border/50 dark:border-white/[0.08] bg-muted/30 dark:bg-white/[0.04] focus:border-accent/40 focus:ring-2 focus:ring-accent/15 transition-all text-center text-2xl tracking-widest font-mono"
                  />
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    {t("auth.login.2fa.hint") || "You can also use a backup code"}
                  </p>
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
                  disabled={busy || !twofaCode} 
                  className="w-full h-10 rounded-lg text-base font-semibold uppercase tracking-wider"
                >
                  {busy ? (
                    <span className="flex items-center gap-2">
                      <motion.span 
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full"
                      />
                      {t("auth.login.2fa.verifying") || "Verifying..."}
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      {t("auth.login.2fa.verify") || "Verify"}
                    </span>
                  )}
                </Button>

                <Button 
                  type="button"
                  variant="ghost"
                  onClick={goBackToLogin}
                  className="w-full"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {t("auth.login.2fa.back") || "Back to login"}
                </Button>
              </form>
            </CardContent>
          </Card>
          
          <div className="mt-6 flex justify-center">
            <div className="h-[1px] w-20 rounded-full bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: 'rgb(var(--bg))' }}>
      {/* Landing-style background - theme-aware */}
      <div className="pointer-events-none fixed inset-0" style={{
        background: `
          radial-gradient(ellipse 70% 50% at 50% 40%, rgba(30,58,138,0.10) 0%, transparent 70%),
          radial-gradient(600px circle at 5% 10%, rgba(59,130,246,0.06) 0%, transparent 60%),
          radial-gradient(500px circle at 95% 80%, rgba(34,211,238,0.04) 0%, transparent 60%),
          rgb(var(--bg))`
      }} />
      <div className="pointer-events-none fixed inset-0 grid-overlay opacity-[0.15]" />

      {/* Language switcher */}
      <div className="fixed top-4 right-4 z-20">
        <LanguageSwitcher />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.95 }} 
        animate={{ opacity: 1, y: 0, scale: 1 }} 
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative w-full max-w-md z-10"
      >
        {/* Premium card */}
        <Card className="rounded-xl border border-border/50 dark:border-white/[0.06] bg-card/95 dark:bg-[#131722]/70 backdrop-blur-xl shadow-lg dark:shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
          <CardHeader className="pb-4 pt-8">
            <div className="flex flex-col items-center gap-4 text-center">
              {/* Logo with cold glow effect - no frame */}
              <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="relative"
              >
                <div className="absolute inset-0 bg-accent/20 rounded-xl blur-xl" />
                <img src={hauntedLogo} alt="Haunted" className="relative h-16 w-16" />
              </motion.div>
              
              <div>
                <CardTitle className="text-2xl font-display font-bold bg-gradient-to-r from-accent via-accent to-accent-2 bg-clip-text text-transparent uppercase tracking-[0.15em]">
                  {t("app.title")}
                </CardTitle>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pb-8">
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1">
                <div className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  {t("auth.login.loginOrEmailLabel") || t("auth.login.loginLabel")}
                </div>
                <Input 
                  value={username} 
                  onChange={(e) => setUsername(e.target.value)} 
                  autoComplete="username"
                  className="h-12 rounded-xl border border-border/50 dark:border-white/[0.08] bg-muted/30 dark:bg-white/[0.04] focus:border-accent/40 focus:ring-2 focus:ring-accent/15 transition-all"
                />
              </div>

              <div className="space-y-1">
                <div className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" />
                  {t("auth.login.passwordLabel")}
                </div>
                <PasswordInput 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  autoComplete="current-password"
                  className="h-12 rounded-xl border border-border/50 dark:border-white/[0.08] bg-muted/30 dark:bg-white/[0.04] focus:border-accent/40 focus:ring-2 focus:ring-accent/15 transition-all"
                />
                <div className="text-right mt-1">
                  <Link to="/forgot-password" className="text-xs text-muted-foreground hover:text-accent transition-colors">
                    {t("auth.login.forgotPassword") || "Forgot password?"}
                  </Link>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-border/30 dark:border-white/[0.06] bg-muted/20 dark:bg-white/[0.03] p-4">
                <div>
                  <div className="text-sm font-medium text-foreground">{t("auth.login.rememberTitle")}</div>
                </div>
                <Switch checked={remember} onCheckedChange={setRemember} />
              </div>

              {successMsg ? (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm text-success bg-success/10 p-3 rounded-xl border border-success/20"
                >
                  {successMsg}
                </motion.div>
              ) : null}

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
                disabled={busy} 
                className="w-full h-12 rounded-xl text-base font-semibold uppercase tracking-wider"
              >
                {busy ? (
                  <span className="flex items-center gap-2">
                    <motion.span 
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full"
                    />
                    {t("auth.login.signingIn")}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <LogIn className="h-4 w-4" />
                    {t("auth.login.signIn")}
                  </span>
                )}
              </Button>
            </form>

            {/* Google OAuth button */}
            {googleAvailable && (
              <div className="mt-4">
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border/30 dark:border-white/[0.06]" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground/50">
                      {t("auth.login.orContinueWith") || "or continue with"}
                    </span>
                  </div>
                </div>
                
                <Button 
                  variant="secondary"
                  type="button"
                  disabled={googleLoading || busy}
                  onClick={() => {
                    setGoogleLoading(true);
                    // Small delay to show loading state before redirect
                    // Also acts as fallback to clear loading if redirect fails
                    setTimeout(() => {
                      window.location.href = "/api/auth/google/start";
                    }, 100);
                    // Fallback: clear loading state if redirect doesn't happen within 5s
                    setTimeout(() => setGoogleLoading(false), 5000);
                  }}
                  className="w-full h-12 rounded-xl text-base font-medium border border-border/50 dark:border-white/[0.08] hover:border-accent/25 hover:shadow-[0_0_15px_rgba(59,130,246,0.1)] transition-all duration-200"
                >
                  {googleLoading ? (
                    <span className="flex items-center gap-2">
                      <motion.span 
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full"
                      />
                      {t("auth.login.googleConnecting") || "Connecting…"}
                    </span>
                  ) : (
                    <>
                      <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      {t("auth.login.continueWithGoogle") || "Continue with Google"}
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Create account link - always visible */}
            <div className="mt-6 text-center text-sm text-muted-foreground/60">
              {t("auth.login.noAccount") || "Don't have an account?"}{" "}
              <Link to="/register" className="text-accent hover:text-accent-2 hover:underline font-medium transition-colors">
                {t("auth.login.createAccount") || "Create account"}
              </Link>
            </div>

            {/* Telegram link */}
            <div className="mt-6 flex justify-center">
              <TelegramLink variant="pill" />
            </div>
          </CardContent>
        </Card>
        
        {/* Bottom decorative line - neon gradient */}
        <div className="mt-6 flex justify-center">
          <div className="h-[1px] w-20 rounded-full bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
        </div>
      </motion.div>
    </div>
  );
}
