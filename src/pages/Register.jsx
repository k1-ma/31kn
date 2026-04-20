import React, { useState, useEffect } from "react";
import { Navigate, useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/auth/AuthProvider.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { apiJson } from "@/lib/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import Input from "@/components/ui/Input.jsx";
import PasswordInput from "@/components/ui/PasswordInput.jsx";
import Button from "@/components/ui/Button.jsx";
import TelegramLink from "@/components/common/TelegramLink.jsx";
import LanguageSwitcher from "@/components/common/LanguageSwitcher.jsx";
import hauntedLogo from "@/assets/haunted.png";
import { UserPlus, Lock, User, Mail, Sparkles, ArrowLeft, RefreshCw } from "lucide-react";

export default function Register() {
  const { t } = useI18n();
  const { user, refresh } = useAuth();
  const nav = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(null);

  // Email verification state (shown after registration)
  const [emailVerifyStep, setEmailVerifyStep] = useState(false);
  const [emailVerifyUserId, setEmailVerifyUserId] = useState(null);
  const [emailVerifyAddress, setEmailVerifyAddress] = useState("");
  const [resendBusy, setResendBusy] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  useEffect(() => {
    // Check if registration is enabled
    apiJson("/api/auth/registration-status")
      .then((res) => setRegistrationEnabled(res?.enabled ?? false))
      .catch(() => setRegistrationEnabled(false));
  }, []);

  if (user) return <Navigate to="/app" replace />;

  // Email validation regex
  const isValidEmail = (emailStr) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(emailStr.trim());
  };

  // Username validation: min 3 chars, alphanumeric + underscore/hyphen/dot
  // Must start with letter/number, cannot have consecutive special chars or end with special char
  const isValidUsername = (usernameStr) => {
    const trimmed = usernameStr.trim();
    if (trimmed.length < 3) return { valid: false, error: "usernameMinLength" };
    if (trimmed.length > 30) return { valid: false, error: "usernameTooLong" };
    // Must contain only allowed characters
    const usernameCharsRegex = /^[a-zA-Z0-9_.-]+$/;
    if (!usernameCharsRegex.test(trimmed)) return { valid: false, error: "usernameInvalidChars" };
    // Must start with letter or number
    if (!/^[a-zA-Z0-9]/.test(trimmed)) return { valid: false, error: "usernameInvalidStart" };
    // Must end with letter or number
    if (!/[a-zA-Z0-9]$/.test(trimmed)) return { valid: false, error: "usernameInvalidEnd" };
    // No consecutive special characters
    if (/[_.-]{2,}/.test(trimmed)) return { valid: false, error: "usernameConsecutiveSpecial" };
    return { valid: true };
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");

    // Validate username
    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setErr(t("auth.register.errors.usernameRequired") || "Username is required");
      return;
    }
    const usernameCheck = isValidUsername(trimmedUsername);
    if (!usernameCheck.valid) {
      if (usernameCheck.error === "usernameMinLength") {
        setErr(t("auth.register.errors.usernameMinLength") || "Username must be at least 3 characters");
      } else if (usernameCheck.error === "usernameTooLong") {
        setErr(t("auth.register.errors.usernameTooLong") || "Username must be at most 30 characters");
      } else if (usernameCheck.error === "usernameInvalidStart") {
        setErr(t("auth.register.errors.usernameInvalidStart") || "Username must start with a letter or number");
      } else if (usernameCheck.error === "usernameInvalidEnd") {
        setErr(t("auth.register.errors.usernameInvalidEnd") || "Username must end with a letter or number");
      } else if (usernameCheck.error === "usernameConsecutiveSpecial") {
        setErr(t("auth.register.errors.usernameConsecutiveSpecial") || "Username cannot have consecutive special characters");
      } else {
        setErr(t("auth.register.errors.usernameInvalidChars") || "Username can only contain letters, numbers, underscores, dots, and hyphens");
      }
      return;
    }

    // Validate email
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErr(t("auth.register.errors.emailRequired") || "Email is required");
      return;
    }
    if (!isValidEmail(trimmedEmail)) {
      setErr(t("auth.register.errors.emailInvalid") || "Invalid email format");
      return;
    }

    if (password !== confirmPassword) {
      setErr(t("auth.register.errors.passwordMismatch") || "Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setErr(t("auth.register.errors.passwordTooShort") || "Password must be at least 8 characters");
      return;
    }

    setBusy(true);
    try {
      const result = await apiJson("/api/auth/register", {
        method: "POST",
        body: { username: trimmedUsername, password, nickname: nickname || undefined, email: trimmedEmail },
      });
      
      // Check if email verification is required
      if (result.emailVerificationRequired) {
        // Show email verification modal instead of redirecting
        setEmailVerifyStep(true);
        setEmailVerifyUserId(result.user?.id);
        setEmailVerifyAddress(trimmedEmail);
        return;
      }
      
      await refresh();
      nav("/", { replace: true });
    } catch (e2) {
      const status = e2?.status;
      const data = e2?.data;
      const errorCode = data?.errorCode || e2?.code;
      
      // CRITICAL FIX: Distinguish network/server errors from validation errors
      // Network errors (status 0) or server errors (503, 5xx) should NOT show "username/email exists"
      if (status === 0 || !status) {
        // Network error - could not reach server
        setErr(t("auth.register.errors.networkError") || "Connection problem. Please check your internet connection and try again.");
      } else if (status === 503) {
        // Server unavailable (e.g., DB down)
        setErr(t("auth.register.errors.serverUnavailable") || "Server is temporarily unavailable. Please try again later.");
      } else if (status >= 500) {
        // Other server errors
        setErr(t("auth.register.errors.serverError") || "Server error. Please try again later.");
      } else if (errorCode === "USERNAME_EXISTS") {
        setErr(t("auth.register.errors.usernameExists") || "This username is already taken. Please choose a different one.");
      } else if (errorCode === "EMAIL_EXISTS") {
        setErr(t("auth.register.errors.emailExists") || "This email is already registered. Try logging in instead.");
      } else if (errorCode === "EMAIL_REQUIRED") {
        setErr(t("auth.register.errors.emailRequired") || "Email is required");
      } else if (errorCode === "EMAIL_INVALID") {
        setErr(t("auth.register.errors.emailInvalid") || "Invalid email format");
      } else if (errorCode === "REGISTRATION_DISABLED") {
        setErr(t("auth.register.errors.registrationDisabled") || "Registration is currently disabled");
      } else {
        const msg = e2?.message;
        setErr(msg && msg !== "Error" ? msg : (t("auth.register.errors.failed") || "Registration failed. Please try again."));
      }
    } finally {
      setBusy(false);
    }
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
      setErr(msg && msg !== "Error" ? msg : t("auth.register.errors.resendFailed") || "Failed to resend email");
    } finally {
      setResendBusy(false);
    }
  };

  // Loading state
  if (registrationEnabled === null) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'rgb(var(--bg))' }}>
        <div className="pointer-events-none fixed inset-0 grid-overlay opacity-[0.16]" />
        <div className="relative text-sm text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  // Registration disabled
  if (!registrationEnabled) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: 'rgb(var(--bg))' }}>
        <div className="pointer-events-none fixed inset-0 grid-overlay opacity-[0.15]" />
        <div className="pointer-events-none fixed inset-0 " style={{ background: `radial-gradient(ellipse 70% 50% at 50% 40%, rgba(30,58,138,0.10) 0%, transparent 70%), rgb(var(--bg))` }} />

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
                  <div className="absolute inset-0 bg-accent/30 rounded-xl blur-xl" />
                  <img src={hauntedLogo} alt="Haunted" className="relative h-20 w-20" />
                </motion.div>
                
                <div>
                  <CardTitle className="text-2xl font-bold text-foreground">
                    {t("auth.register.disabled.title") || "Registration Disabled"}
                  </CardTitle>
                  <div className="text-sm text-muted-foreground mt-2">
                    {t("auth.register.disabled.message") || "Registration is currently closed. Please contact the administrator."}
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pb-8">
              <div className="flex flex-col gap-4">
                <Link to="/login">
                  <Button variant="outline" className="w-full h-10 rounded-lg">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    {t("auth.register.backToLogin") || "Back to Login"}
                  </Button>
                </Link>

                <div className="flex justify-center">
                  <TelegramLink variant="pill" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  // Email verification required step (after successful registration)
  if (emailVerifyStep) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: 'rgb(var(--bg))' }}>
        {/* Haunted background effects */}
        <div className="pointer-events-none fixed inset-0 grid-overlay opacity-[0.15]" />
        <div className="pointer-events-none fixed inset-0 " style={{ background: `radial-gradient(ellipse 70% 50% at 50% 40%, rgba(30,58,138,0.10) 0%, transparent 70%), rgb(var(--bg))` }} />

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
                    {t("auth.register.emailVerify.title") || "Verify Your Email"}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-2">
                    {t("auth.register.emailVerify.subtitle") || "Please verify your email address to continue"}
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
                    {t("auth.register.emailVerify.resendSuccess") || "Verification email sent! Check your inbox."}
                  </motion.div>
                ) : (
                  <>
                    <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 text-sm text-muted-foreground">
                      <p className="mb-2">
                        {t("auth.register.emailVerify.message") || "We've sent a verification link to your email. Please click the link to verify your account."}
                      </p>
                      <ul className="list-disc list-inside space-y-1 text-xs mt-3">
                        <li>{t("auth.register.emailVerify.tip1") || "Check your spam/junk folder"}</li>
                        <li>{t("auth.register.emailVerify.tip2") || "The link expires in 24 hours"}</li>
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
                          {t("auth.register.emailVerify.sending") || "Sending..."}
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <RefreshCw className="h-4 w-4" />
                          {t("auth.register.emailVerify.resend") || "Resend Verification Email"}
                        </span>
                      )}
                    </Button>
                  </>
                )}

                <Link to="/login">
                  <Button 
                    type="button"
                    variant="ghost"
                    className="w-full"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    {t("auth.register.emailVerify.goToLogin") || "Go to Login"}
                  </Button>
                </Link>
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
              {/* Logo with glow effect */}
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
                <div className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1">
                  <Sparkles className="h-3.5 w-3.5" />
                  {t("auth.register.subtitle") || "Create your account"}
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pb-8">
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1">
                <div className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  {t("auth.register.usernameLabel") || "Username (login)"} *
                </div>
                <Input 
                  value={username} 
                  onChange={(e) => setUsername(e.target.value)} 
                  autoComplete="username"
                  required
                  placeholder={t("auth.register.usernamePlaceholder") || "Unique login name"}
                  className="h-12 rounded-xl border border-border/50 dark:border-white/[0.08] bg-muted/30 dark:bg-white/[0.04] focus:border-accent/40 focus:ring-2 focus:ring-accent/15 transition-all"
                />
                <div className="text-[10px] text-muted-foreground/70 px-1">
                  {t("auth.register.usernameHint") || "3-30 characters, letters, numbers, _, -, ."}
                </div>
              </div>

              <div className="space-y-1">
                <div className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" />
                  {t("auth.register.emailLabel") || "Email"} *
                </div>
                <Input 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  type="email"
                  autoComplete="email"
                  required
                  className="h-12 rounded-xl border border-border/50 dark:border-white/[0.08] bg-muted/30 dark:bg-white/[0.04] focus:border-accent/40 focus:ring-2 focus:ring-accent/15 transition-all"
                />
              </div>

              <div className="space-y-1">
                <div className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  {t("auth.register.nicknameLabel") || "Display Name"} ({t("common.optional") || "optional"})
                </div>
                <Input 
                  value={nickname} 
                  onChange={(e) => setNickname(e.target.value)} 
                  autoComplete="name"
                  placeholder={t("auth.register.nicknamePlaceholder") || "How you want to be called"}
                  className="h-12 rounded-xl border border-border/50 dark:border-white/[0.08] bg-muted/30 dark:bg-white/[0.04] focus:border-accent/40 focus:ring-2 focus:ring-accent/15 transition-all"
                />
                <div className="text-[10px] text-muted-foreground/70 px-1">
                  {t("auth.register.nicknameHint") || "Shown in the app. Can be any name, doesn't have to be unique."}
                </div>
              </div>

              <div className="space-y-1">
                <div className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" />
                  {t("auth.register.passwordLabel") || "Password"} *
                </div>
                <PasswordInput 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  autoComplete="new-password"
                  required
                  className="h-12 rounded-xl border border-border/50 dark:border-white/[0.08] bg-muted/30 dark:bg-white/[0.04] focus:border-accent/40 focus:ring-2 focus:ring-accent/15 transition-all"
                />
              </div>

              <div className="space-y-1">
                <div className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" />
                  {t("auth.register.confirmPasswordLabel") || "Confirm Password"} *
                </div>
                <PasswordInput 
                  value={confirmPassword} 
                  onChange={(e) => setConfirmPassword(e.target.value)} 
                  autoComplete="new-password"
                  required
                  className="h-12 rounded-xl border border-border/50 dark:border-white/[0.08] bg-muted/30 dark:bg-white/[0.04] focus:border-accent/40 focus:ring-2 focus:ring-accent/15 transition-all"
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
                    {t("auth.register.creating") || "Creating..."}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <UserPlus className="h-4 w-4" />
                    {t("auth.register.createAccount") || "Create Account"}
                  </span>
                )}
              </Button>
            </form>

            {/* Already have account link */}
            <div className="mt-6 text-center text-sm text-muted-foreground/60">
              {t("auth.register.haveAccount") || "Already have an account?"}{" "}
              <Link to="/login" className="text-accent hover:text-accent-2 hover:underline font-medium transition-colors">
                {t("auth.register.signIn") || "Sign in"}
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
