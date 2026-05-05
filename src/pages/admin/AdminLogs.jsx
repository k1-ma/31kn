import React, { useEffect, useState } from "react";
import AdminLayout from "./AdminLayout.jsx";
import { apiJson } from "@/lib/api.js";

export default function AdminLogs() {
  const [logs, setLogs] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    apiJson("/api/admin/logs?limit=100")
      .then((res) => setLogs(res?.logs || []))
      .catch((e) => setErr(e?.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, []);
  return (
    <AdminLayout title="Logs">
      {err && <div className="text-red-400">{err}</div>}
      {loading ? (
        <div className="text-slate-500">Loading…</div>
      ) : (
        <div className="rounded-2xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-xs uppercase text-slate-500 tracking-wider">
              <tr>
                <th className="px-4 py-2 text-left">When</th>
                <th className="px-4 py-2 text-left">Actor</th>
                <th className="px-4 py-2 text-left">Action</th>
                <th className="px-4 py-2 text-left">Detail</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l, i) => (
                <tr key={l.id || i} className="border-t border-slate-800">
                  <td className="px-4 py-2 text-slate-500">{l.created_at}</td>
                  <td className="px-4 py-2">{l.actor_email || l.actor_id || "system"}</td>
                  <td className="px-4 py-2">{l.action}</td>
                  <td className="px-4 py-2 text-slate-400 truncate max-w-md">{l.detail || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
