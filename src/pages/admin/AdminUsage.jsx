import React, { useEffect, useState } from "react";
import AdminLayout from "./AdminLayout.jsx";
import { apiJson } from "@/lib/api.js";

export default function AdminUsage() {
  const [stats, setStats] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ok | not-implemented | error
  const [err, setErr] = useState("");

  useEffect(() => {
    apiJson("/api/admin/usage")
      .then((res) => {
        setStats(res);
        setStatus("ok");
      })
      .catch((e) => {
        if (e?.status === 404) setStatus("not-implemented");
        else {
          setErr(e?.message || "Failed to load");
          setStatus("error");
        }
      });
  }, []);

  return (
    <AdminLayout title="Usage">
      {status === "loading" && <div className="text-slate-500">Loading…</div>}
      {status === "not-implemented" && (
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 text-sm text-slate-400">
          Endpoint <code className="text-amber-400">/api/admin/usage</code> isn't implemented yet.
        </div>
      )}
      {status === "error" && <div className="text-red-400">{err}</div>}
      {status === "ok" && (
        <pre className="rounded-2xl bg-slate-900 border border-slate-800 p-4 text-xs text-slate-300 overflow-auto">
          {JSON.stringify(stats, null, 2)}
        </pre>
      )}
    </AdminLayout>
  );
}
