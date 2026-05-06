import React, { useEffect, useState } from "react";
import AdminLayout from "./AdminLayout.jsx";
import { apiJson } from "@/lib/api.js";
import Input from "@/components/ui/Input.jsx";

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiJson("/api/admin/users")
      .then((res) => setUsers(res?.users || []))
      .catch((e) => setErr(e?.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = users.filter((u) => {
    const term = q.trim().toLowerCase();
    if (!term) return true;
    return (u.email || "").toLowerCase().includes(term) || (u.username || "").toLowerCase().includes(term);
  });

  return (
    <AdminLayout title="Users">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by email or username" />
      {err && <div className="text-red-400 my-3">{err}</div>}
      {loading ? (
        <div className="text-slate-500 mt-4">Loading…</div>
      ) : (
        <div className="mt-4 rounded-2xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-xs uppercase text-slate-500 tracking-wider">
              <tr>
                <th className="px-4 py-2 text-left">Email</th>
                <th className="px-4 py-2 text-left">Username</th>
                <th className="px-4 py-2 text-left">Role</th>
                <th className="px-4 py-2 text-left">Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-t border-slate-800">
                  <td className="px-4 py-2">{u.email}</td>
                  <td className="px-4 py-2">{u.username}</td>
                  <td className="px-4 py-2">{u.role || "user"}</td>
                  <td className="px-4 py-2 text-slate-500">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : ""}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                    No users
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  );
}
