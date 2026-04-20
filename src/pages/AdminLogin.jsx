import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/auth/AuthProvider.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import Input from "@/components/ui/Input.jsx";
import Button from "@/components/ui/Button.jsx";
import hauntedLogo from "@/assets/haunted.png";
import { Shield, Lock, User, LogIn, ArrowLeft } from "lucide-react";

export default function AdminLogin() {
  const { t } = useI18n();
  const { user, login, verify2faLogin, isAdmin } = useAuth();
  const nav = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // 2FA state
  const [twofaStep, setTwofaStep] = useState(false);
  const [twofaTicket, setTwofaTicket] = useState("");
  const [twofaCode, setTwofaCode] = useState("");

  if (user && isAdmin) return <Navigate to="/admincrm-panel/dashboard" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const result = await login({ username, password, remember: true });

      // Handle 2FA challenge
      if (result?.requires2fa) {
        setTwofaStep(true);
        setTwofaTicket(result.ticket);
        setPassword("");
        setBusy(false);
        return;
      }

      if (result?.user?.role !== "admin") throw new Error(t("auth.admin.errors.notAdmin"));
      nav("/admincrm-panel/dashboard", { replace: true });
    } catch (e2) {
      const msg = e2?.message;
      setErr(msg && msg !== "Error" ? msg : t("auth.admin.errors.failed"));
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
      if (!u || u.role !== "admin") throw new Error(t("auth.admin.errors.notAdmin"));
      nav("/admincrm-panel/dashboard", { replace: true });
    } catch (e2) {
      const msg = e2?.message;
      setErr(msg && msg !== "Error" ? msg : t("auth.admin.errors.invalid2fa"));
    } finally {
      setBusy(false);
    }
  };

  const goBackToLogin = () => {
    setTwofaStep(false);
    setTwofaTicket("");
    setTwofaCode("");
    setErr("");
  };

  const bgEffects = (
    <>
      <div className="pointer-events-none fixed inset-0 grid-overlay opacity-[0.2]" />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-[#3B82F6]/5" />
      <div className="pointer-events-none fixed top-1/4 left-1/4 w-[600px] h-[600px] bg-gradient-to-r from-amber-500/15 to-orange-500/12 rounded-full blur-[150px] opacity-40 animate-pulse" />
      <div className="pointer-events-none fixed bottom-1/4 right-1/4 w-[500px] h-[500px] bg-gradient-to-r from-[#3B82F6]/15 to-amber-500/10 rounded-full blur-[120px] opacity-30 animate-pulse" style={{ animationDelay: '1s' }} />
    </>
  );

  // 2FA Step UI
  if (twofaStep) {
    return (
      <div className="min-h-screen app-bg flex items-center justify-center p-4 relative overflow-hidden">
        {bgEffects}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative w-full max-w-md z-10"
        >
          <Card className="rounded-xl border-2 border-amber-500/25 bg-card/85 backdrop-blur-xl shadow-[0_0_50px_rgba(245,158,11,0.12),0_25px_50px_-12px_rgba(0,0,0,0.5)]">
            <CardHeader className="pb-4 pt-8">
              <div className="flex flex-col items-center gap-4 text-center">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  <div className="h-16 w-16 rounded-full bg-amber-500/20 flex items-center justify-center">
                    <Shield className="h-8 w-8 text-amber-500" />
                  </div>
                </motion.div>
                <div>
                  <CardTitle className="text-2xl font-bold bg-gradient-to-r from-amber-400 via-orange-500 to-amber-500 bg-clip-text text-transparent">
                    {t("auth.admin.twofa.title")}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-2">
                    {t("auth.admin.twofa.subtitle")}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pb-8">
              <form onSubmit={on2faSubmit} className="space-y-4">
                <div className="space-y-1">
                  <div className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5" />
                    {t("auth.admin.twofa.codeLabel")}
                  </div>
                  <Input
                    value={twofaCode}
                    onChange={(e) => setTwofaCode(e.target.value.replace(/[^0-9A-Za-z]/g, ""))}
                    placeholder="123456"
                    autoComplete="one-time-code"
                    autoFocus
                    className="h-12 rounded-2xl border-2 bg-background/50 focus:border-amber-500/50 focus:ring-4 focus:ring-amber-500/10 transition-all text-center text-2xl tracking-widest font-mono"
                  />
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    {t("auth.admin.twofa.hint")}
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
                  className="w-full h-12 rounded-2xl text-base font-semibold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-lg shadow-amber-500/20 hover:shadow-xl hover:shadow-amber-500/30 transition-all"
                >
                  {busy ? (
                    <span className="flex items-center gap-2">
                      <motion.span
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full"
                      />
                      {t("auth.admin.twofa.verifying")}
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      {t("auth.admin.twofa.verify")}
                    </span>
                  )}
                </Button>

                <Button type="button" variant="ghost" onClick={goBackToLogin} className="w-full">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {t("auth.admin.twofa.back")}
                </Button>
              </form>
            </CardContent>
          </Card>
          <div className="mt-6 flex justify-center">
            <div className="h-1 w-20 rounded-full bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen app-bg flex items-center justify-center p-4 relative overflow-hidden">
      {bgEffects}

      <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.95 }} 
        animate={{ opacity: 1, y: 0, scale: 1 }} 
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative w-full max-w-md z-10"
      >
        {/* Haunted admin card */}
        <Card className="rounded-xl border-2 border-amber-500/25 bg-card/85 backdrop-blur-xl shadow-[0_0_50px_rgba(245,158,11,0.12),0_25px_50px_-12px_rgba(0,0,0,0.5)]">
          <CardHeader className="pb-4 pt-8">
            <div className="flex flex-col items-center gap-4 text-center">
              {/* Logo with admin glow effect */}
              <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="relative"
              >
                <div className="absolute inset-0 bg-amber-500/35 rounded-xl blur-xl" />
                <img src={hauntedLogo} alt="Haunted Admin" className="relative h-20 w-20 rounded-2xl shadow-[0_0_30px_rgba(245,158,11,0.25)] ring-2 ring-amber-500/30" />
                <div className="absolute -bottom-1 -right-1 h-7 w-7 bg-gradient-to-r from-amber-500 to-orange-500 rounded-full flex items-center justify-center shadow-lg">
                  <Shield className="h-4 w-4 text-white" />
                </div>
              </motion.div>
              
              <div>
                <CardTitle className="text-3xl font-bold bg-gradient-to-r from-amber-400 via-orange-500 to-amber-500 bg-clip-text text-transparent flex items-center justify-center gap-2 uppercase tracking-wider">
                  {t("auth.admin.title")}
                </CardTitle>
                <div className="text-sm text-muted-foreground mt-1">
                  {t("auth.admin.subtitle")}
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pb-8">
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1">
                <div className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  {t("auth.admin.loginLabel")}
                </div>
                <Input 
                  value={username} 
                  onChange={(e) => setUsername(e.target.value)} 
                  autoComplete="username"
                  className="h-12 rounded-2xl border-2 bg-background/50 focus:border-amber-500/50 focus:ring-4 focus:ring-amber-500/10 transition-all"
                />
              </div>
              
              <div className="space-y-1">
                <div className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" />
                  {t("auth.admin.passwordLabel")}
                </div>
                <Input 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  type="password" 
                  autoComplete="current-password"
                  className="h-12 rounded-2xl border-2 bg-background/50 focus:border-amber-500/50 focus:ring-4 focus:ring-amber-500/10 transition-all"
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
                className="w-full h-12 rounded-2xl text-base font-semibold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 shadow-lg shadow-amber-500/20 hover:shadow-xl hover:shadow-amber-500/30 transition-all"
              >
                {busy ? (
                  <span className="flex items-center gap-2">
                    <motion.span 
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full"
                    />
                    {t("auth.admin.signingIn")}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <LogIn className="h-4 w-4" />
                    {t("auth.admin.signIn")}
                  </span>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
        
        {/* Bottom decorative line - Haunted admin amber */}
        <div className="mt-6 flex justify-center">
          <div className="h-1 w-20 rounded-full bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
        </div>
      </motion.div>
    </div>
  );
}
