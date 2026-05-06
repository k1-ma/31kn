import React, { useEffect, useState } from "react";
import AdminLayout from "./AdminLayout.jsx";
import { apiJson } from "@/lib/api.js";

export default function AdminUsage() {
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    apiJson("/api/admin/usage")
      .then(setStats)
      .catch((e) => setErr(e?.message || "Failed to load"));
  }, []);
  return (
    <AdminLayout title="Usage">
      {err && <div className="text-red-400">{err}</div>}
      <pre className="rounded-2xl bg-slate-900 border border-slate-800 p-4 text-xs text-slate-300 overflow-auto">
        {stats ? JSON.stringify(stats, null, 2) : "Loading…"}
      </pre>
    </AdminLayout>
  );
}
