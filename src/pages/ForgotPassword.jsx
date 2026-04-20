import React, { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { apiJson } from "@/lib/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import Input from "@/components/ui/Input.jsx";
import Button from "@/components/ui/Button.jsx";
import hauntedLogo from "@/assets/haunted.png";
import { Mail, ArrowLeft, Send, CheckCircle, RefreshCw } from "lucide-react";

export default function ForgotPassword() {
  const { t } = useI18n();

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("form"); // form | sending | success | resending
  const [err, setErr] = useState("");
  const [resendSuccess, setResendSuccess] = useState(false);

  const onSubmit = async (e) => {
    if (e) e.preventDefault();
    setErr("");
    setResendSuccess(false);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErr(t("auth.forgotPassword.errors.emailRequired") || "Email is required");
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setErr(t("auth.forgotPassword.errors.emailInvalid") || "Invalid email format");
      return;
    }

    setStatus("sending");
    try {
      await apiJson("/api/auth/forgot-password", {
        method: "POST",
        body: { email: trimmedEmail },
      });
      setStatus("success");
    } catch (e) {
      // Always show success to prevent email enumeration
      setStatus("success");
    }
  };

  const onResend = async () => {
    setStatus("resending");
    setResendSuccess(false);
    try {
      await apiJson("/api/auth/forgot-password", {
        method: "POST",
        body: { email: email.trim() },
      });
      setResendSuccess(true);
    } catch {
      // Always show success to prevent email enumeration
      setResendSuccess(true);
    } finally {
      setStatus("success");
    }
  };

  if (status === "success" || status === "resending") {
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
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 200 }}
                  className="h-16 w-16 rounded-full bg-success/20 flex items-center justify-center"
                >
                  <CheckCircle className="h-10 w-10 text-success" />
                </motion.div>
                
                <div>
                  <CardTitle className="text-2xl font-bold">
                    {t("auth.forgotPassword.success.title") || "Check Your Email"}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-2">
                    {t("auth.forgotPassword.success.message") || "If an account exists with this email, we've sent you a password reset link."}
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pb-8">
              <div className="space-y-4">
                {resendSuccess && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm text-success bg-success/10 p-4 rounded-xl border border-success/20 text-center"
                  >
                    {t("auth.forgotPassword.success.resendSuccess") || "Email sent! Check your inbox."}
                  </motion.div>
                )}

                <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 text-sm text-muted-foreground">
                  <p className="mb-2">
                    <strong>{t("auth.forgotPassword.success.checkSpam") || "Don't see the email?"}</strong>
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>{t("auth.forgotPassword.success.tip1") || "Check your spam/junk folder"}</li>
                    <li>{t("auth.forgotPassword.success.tip2") || "The link expires in 1 hour"}</li>
                    <li>{t("auth.forgotPassword.success.tip3") || "Make sure you entered the correct email"}</li>
                  </ul>
                </div>

                <Button 
                  onClick={onResend}
                  disabled={status === "resending"}
                  variant="secondary"
                  className="w-full h-10 rounded-lg"
                >
                  {status === "resending" ? (
                    <span className="flex items-center gap-2">
                      <motion.span 
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full"
                      />
                      {t("auth.forgotPassword.success.sendingAgain") || "Sending..."}
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4" />
                      {t("auth.forgotPassword.success.sendAgain") || "Send again"}
                    </span>
                  )}
                </Button>

                <Link to="/login">
                  <Button variant="ghost" className="w-full h-10 rounded-lg">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    {t("auth.forgotPassword.backToLogin") || "Back to Login"}
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
              
              <div>
                <CardTitle className="text-2xl font-bold">
                  {t("auth.forgotPassword.title") || "Forgot Password?"}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-2">
                  {t("auth.forgotPassword.subtitle") || "Enter your email and we'll send you a reset link"}
                </p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pb-8">
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1">
                <div className="mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" />
                  {t("auth.forgotPassword.emailLabel") || "Email Address"}
                </div>
                <Input 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  type="email"
                  autoComplete="email"
                  placeholder="your@email.com"
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
                disabled={status === "sending"} 
                className="w-full h-10 rounded-lg text-base font-semibold"
              >
                {status === "sending" ? (
                  <span className="flex items-center gap-2">
                    <motion.span 
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full"
                    />
                    {t("auth.forgotPassword.sending") || "Sending..."}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Send className="h-4 w-4" />
                    {t("auth.forgotPassword.sendLink") || "Send Reset Link"}
                  </span>
                )}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <Link to="/login" className="text-sm text-muted-foreground hover:text-accent transition-colors">
                <span className="flex items-center justify-center gap-1">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {t("auth.forgotPassword.backToLogin") || "Back to Login"}
                </span>
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
