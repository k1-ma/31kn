import React, { useEffect, useState } from "react";
import AdminLayout from "./AdminLayout.jsx";
import { apiJson } from "@/lib/api.js";

export default function AdminBans() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("loading");
  const [err, setErr] = useState("");

  useEffect(() => {
    apiJson("/api/admin/bans")
      .then((res) => {
        setItems(res?.bans || []);
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
    <AdminLayout title="Bans">
      {status === "loading" && <div className="text-slate-500">Loading…</div>}
      {status === "not-implemented" && (
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 text-sm text-slate-400">
          Endpoint <code className="text-amber-400">/api/admin/bans</code> isn't implemented yet.
        </div>
      )}
      {status === "error" && <div className="text-red-400">{err}</div>}
      {status === "ok" && items.length === 0 && (
        <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 text-sm text-slate-400">
          No bans
        </div>
      )}
      {status === "ok" && items.length > 0 && (
        <div className="rounded-2xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-xs uppercase text-slate-500 tracking-wider">
              <tr>
                <th className="px-4 py-2 text-left">User</th>
                <th className="px-4 py-2 text-left">Reason</th>
                <th className="px-4 py-2 text-left">Until</th>
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.id} className="border-t border-slate-800">
                  <td className="px-4 py-2">{b.user_email || b.user_id}</td>
                  <td className="px-4 py-2 text-slate-400">{b.reason || "—"}</td>
                  <td className="px-4 py-2 text-slate-500">{b.expires_at || "permanent"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
