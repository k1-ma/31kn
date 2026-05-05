import React, { useEffect, useState } from "react";
import AdminLayout from "./AdminLayout.jsx";
import { apiJson } from "@/lib/api.js";

export default function AdminBans() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiJson("/api/admin/bans")
      .then((res) => setItems(res?.bans || []))
      .catch((e) => setErr(e?.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AdminLayout title="Bans">
      {err && <div className="text-red-400">{err}</div>}
      {loading ? (
        <div className="text-slate-500">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-slate-500">No bans</div>
      ) : (
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
