import React, { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { apiJson } from "@/lib/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import Button from "@/components/ui/Button.jsx";
import hauntedLogo from "@/assets/haunted.png";
import { Mail, CheckCircle, XCircle, Loader2, ArrowLeft } from "lucide-react";

export default function ConfirmEmailChange() {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState("loading"); // loading | success | error
  const [newEmail, setNewEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMessage(t("auth.confirmEmailChange.errors.noToken") || "No confirmation token provided");
      return;
    }

    confirmChange();
  }, [token]);

  const confirmChange = async () => {
    setStatus("loading");
    try {
      const result = await apiJson("/api/auth/confirm-email-change", {
        method: "POST",
        body: { token },
      });
      
      setNewEmail(result.newEmail || "");
      setStatus("success");
    } catch (e) {
      setStatus("error");
      const errorCode = e?.data?.errorCode || e?.code;
      
      if (errorCode === "TOKEN_EXPIRED") {
        setErrorMessage(t("auth.confirmEmailChange.errors.tokenExpired") || "Confirmation link has expired. Please request the email change again.");
      } else if (errorCode === "TOKEN_INVALID") {
        setErrorMessage(t("auth.confirmEmailChange.errors.tokenInvalid") || "Invalid confirmation link.");
      } else {
        setErrorMessage(e?.message || t("auth.confirmEmailChange.errors.failed") || "Confirmation failed. Please try again.");
      }
    }
  };

  const renderContent = () => {
    switch (status) {
      case "loading":
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
              {t("auth.confirmEmailChange.confirming") || "Confirming email change..."}
            </CardTitle>
            <p className="text-sm text-muted-foreground text-center mt-2">
              {t("auth.confirmEmailChange.pleaseWait") || "Please wait a moment"}
            </p>
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
              {t("auth.confirmEmailChange.success.title") || "Email Changed!"}
            </CardTitle>
            <p className="text-sm text-muted-foreground text-center mt-2">
              {t("auth.confirmEmailChange.success.message") || "Your email has been successfully changed."}
            </p>
            {newEmail && (
              <p className="text-sm text-accent text-center mt-2 font-medium">
                {newEmail}
              </p>
            )}
            <div className="mt-6">
              <Link to="/">
                <Button className="w-full h-10 rounded-lg">
                  {t("auth.confirmEmailChange.goToApp") || "Go to App"}
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
              {t("auth.confirmEmailChange.error.title") || "Confirmation Failed"}
            </CardTitle>
            <p className="text-sm text-muted-foreground text-center mt-2">
              {errorMessage}
            </p>
            <div className="mt-6 space-y-3">
              <Link to="/settings">
                <Button variant="outline" className="w-full h-10 rounded-lg">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {t("auth.confirmEmailChange.goToSettings") || "Go to Settings"}
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
