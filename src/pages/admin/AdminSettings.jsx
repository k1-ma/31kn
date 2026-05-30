import React, { useEffect, useState } from "react";
import AdminLayout from "./AdminLayout.jsx";
import { apiJson } from "@/lib/api.js";
import Button from "@/components/ui/Button.jsx";
import Input from "@/components/ui/Input.jsx";

export default function AdminSettings() {
  const [settings, setSettings] = useState(null);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);

  useEffect(() => {
    if (!saved) return;
    const id = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(id);
  }, [saved]);

  useEffect(() => {
    apiJson("/api/admin/settings")
      .then((res) => {
        setSettings(res || {});
        setRegistrationEnabled(res?.registrationEnabled ?? true);
      })
      .catch((e) => setErr(e?.message || "Failed to load"));
  }, []);

  const save = async () => {
    setBusy(true);
    setErr("");
    setSaved(false);
    try {
      await apiJson("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({ registrationEnabled }),
      });
      setSaved(true);
    } catch (e) {
      setErr(e?.message || "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminLayout title="Settings">
      {err && <div className="text-red-400 mb-4">{err}</div>}
      {saved && <div className="text-emerald-400 mb-4">Settings saved ✓</div>}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 space-y-4 max-w-xl">
        <label className="flex items-center justify-between">
          <span className="text-sm">Allow new registrations</span>
          <input
            type="checkbox"
            checked={registrationEnabled}
            onChange={(e) => setRegistrationEnabled(e.target.checked)}
            className="w-5 h-5 accent-amber-500"
          />
        </label>
        <Button onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </AdminLayout>
  );
}
