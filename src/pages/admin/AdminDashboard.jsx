import React, { useEffect, useState } from "react";
import AdminLayout from "./AdminLayout.jsx";
import { apiJson } from "@/lib/api.js";
import Skeleton from "@/components/ui/Skeleton.jsx";
import { formatBytes } from "@/lib/adminUtils.js";

function Stat({ label, value, sub }) {
  return (
    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-2xl font-bold mt-1 tabular-nums">{value ?? "—"}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
      <Skeleton className="w-1/2" height="h-3" />
      <Skeleton className="w-1/3 mt-2" height="h-7" />
    </div>
  );
}

const num = (v) => Number(v || 0).toLocaleString();

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [topUsers, setTopUsers] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiJson("/api/admin/dashboard"),
      apiJson("/api/admin/dashboard/top-users?limit=10").then((r) => r?.users || []).catch(() => []),
    ])
      .then(([s, top]) => {
        setStats(s);
        setTopUsers(top);
      })
      .catch((e) => setErr(e?.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AdminLayout title="Dashboard">
      {err && <div className="text-red-400 mb-4">{err}</div>}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <StatSkeleton key={i} />)}
        </div>
      ) : !stats ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center text-slate-500">
          Could not load stats.
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat label="Total users" value={num(stats.total_users)} />
            <Stat label="Active sessions" value={num(stats.active_sessions)} />
            <Stat label="Transactions" value={num(stats.total_transactions)} />
            <Stat label="Wallets" value={num(stats.total_wallets)} />
            <Stat label="Requests today" value={num(stats.requests_today)} />
            <Stat label="Data out today" value={formatBytes(Number(stats.bytes_today || 0))} />
            <Stat label="Audit log entries" value={num(stats.total_logs)} />
            <Stat
              label="Stats cache"
              value={stats.cache_updated_at ? "fresh" : "—"}
              sub={stats.cache_updated_at ? new Date(stats.cache_updated_at).toLocaleString() : "never refreshed"}
            />
          </div>

          <div className="mt-6 rounded-2xl border border-slate-800 overflow-hidden">
            <div className="bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-300">
              Top users by activity
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-900/60 text-xs uppercase text-slate-500 tracking-wider">
                <tr>
                  <th className="px-4 py-2 text-left">User</th>
                  <th className="px-4 py-2 text-left">Role</th>
                  <th className="px-4 py-2 text-right">Transactions</th>
                  <th className="px-4 py-2 text-right">Wallets</th>
                  <th className="px-4 py-2 text-left">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {topUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                      No data yet — refresh the stats cache to populate.
                    </td>
                  </tr>
                ) : (
                  topUsers.map((u) => (
                    <tr key={u.id} className="border-t border-slate-800">
                      <td className="px-4 py-2">{u.nickname || u.username || `#${u.id}`}</td>
                      <td className="px-4 py-2 text-slate-400">{u.role || "user"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{num(u.transactions_count)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{num(u.wallets_count)}</td>
                      <td className="px-4 py-2 text-slate-500">
                        {u.last_seen_at ? new Date(u.last_seen_at).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
