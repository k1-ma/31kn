import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import Input from "@/components/ui/Input.jsx";
import Button from "@/components/ui/Button.jsx";

export default function AdminLogin() {
  const { t } = useI18n();
  const { user, isAdmin, login } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (user && isAdmin) return <Navigate to="/admincrm-panel/dashboard" replace />;
  if (user && !isAdmin) return <Navigate to="/" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await login({ username: username.trim(), password, remember: true });
      if (res?.ok) nav("/admincrm-panel/dashboard");
      else setErr(res?.error || t("errors.forbidden"));
    } catch (e2) {
      setErr(e2?.message || t("errors.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-5 bg-slate-950">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-7">
        <div className="text-amber-500 text-sm tracking-widest font-semibold mb-2">ADMIN</div>
        <h1 className="text-xl font-bold text-slate-100">Koshyk Admin</h1>
        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t("auth.email")} required />
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("auth.password")}
            required
          />
          {err && <div className="text-sm text-red-400">{err}</div>}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? t("common.loading") : t("auth.login")}
          </Button>
        </form>
      </div>
    </div>
  );
}
