import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import AdminLayout from "./AdminLayout.jsx";
import { apiJson } from "@/lib/api.js";
import Skeleton from "@/components/ui/Skeleton.jsx";
import { formatBytes, formatMs } from "@/lib/adminUtils.js";

function StatCard({ label, value, sub }) {
  return (
    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-2xl font-bold mt-1 tabular-nums">{value ?? "—"}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

function dayLabel(day) {
  const d = new Date(day);
  if (Number.isNaN(d.getTime())) return String(day);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function AdminUsage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiJson("/api/admin/usage")
      .then(setData)
      .catch((e) => setErr(e?.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const totals = data?.totals || {};
  const stats = data?.stats || [];

  // Aggregate per-day across users/IPs for the chart (last 30 days, ascending).
  const perDay = useMemo(() => {
    const byDay = new Map();
    for (const r of stats) {
      const key = typeof r.day === "string" ? r.day.slice(0, 10) : new Date(r.day).toISOString().slice(0, 10);
      const cur = byDay.get(key) || { day: key, requests: 0, bytes: 0 };
      cur.requests += Number(r.requests || 0);
      cur.bytes += Number(r.bytes_in || 0) + Number(r.bytes_out || 0);
      byDay.set(key, cur);
    }
    return Array.from(byDay.values())
      .sort((a, b) => a.day.localeCompare(b.day))
      .slice(-30)
      .map((d) => ({ ...d, label: dayLabel(d.day) }));
  }, [stats]);

  const topRows = useMemo(() => stats.slice(0, 20), [stats]);

  const totalRequests = Number(totals.total_requests || 0);
  const totalMs = Number(totals.total_ms || 0);
  const avgMs = totalRequests > 0 ? totalMs / totalRequests : 0;

  return (
    <AdminLayout title="Usage">
      {err && <div className="text-red-400 mb-4">{err}</div>}

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
              <Skeleton className="w-1/2" height="h-3" />
              <Skeleton className="w-1/3 mt-2" height="h-7" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total requests" value={totalRequests.toLocaleString()} />
            <StatCard label="Data in" value={formatBytes(Number(totals.total_bytes_in || 0))} />
            <StatCard label="Data out" value={formatBytes(Number(totals.total_bytes_out || 0))} />
            <StatCard label="Avg latency" value={formatMs(Math.round(avgMs))} sub={`${formatMs(totalMs)} total`} />
          </div>

          <div className="mt-6 rounded-2xl bg-slate-900 border border-slate-800 p-5">
            <div className="text-sm font-semibold text-slate-300 mb-4">Requests per day</div>
            {perDay.length === 0 ? (
              <div className="text-slate-500 text-sm py-8 text-center">No usage recorded yet.</div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={perDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="label" stroke="#64748b" fontSize={11} tickLine={false} />
                    <YAxis stroke="#64748b" fontSize={11} tickLine={false} width={40} />
                    <Tooltip
                      contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, color: "#e2e8f0" }}
                      cursor={{ fill: "#1e293b55" }}
                    />
                    <Bar dataKey="requests" fill="#6366f1" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="mt-6 rounded-2xl border border-slate-800 overflow-hidden">
            <div className="bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-300">
              Top activity (by requests)
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-900/60 text-xs uppercase text-slate-500 tracking-wider">
                <tr>
                  <th className="px-4 py-2 text-left">Day</th>
                  <th className="px-4 py-2 text-left">User</th>
                  <th className="px-4 py-2 text-left">IP</th>
                  <th className="px-4 py-2 text-right">Requests</th>
                  <th className="px-4 py-2 text-right">In</th>
                  <th className="px-4 py-2 text-right">Out</th>
                </tr>
              </thead>
              <tbody>
                {topRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500">No usage rows</td>
                  </tr>
                ) : (
                  topRows.map((r, i) => (
                    <tr key={i} className="border-t border-slate-800">
                      <td className="px-4 py-2 text-slate-400">{dayLabel(r.day)}</td>
                      <td className="px-4 py-2">{r.username || (r.user_id ? `#${r.user_id}` : "—")}</td>
                      <td className="px-4 py-2 text-slate-500 font-mono text-xs">{r.ip || "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{Number(r.requests || 0).toLocaleString()}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-400">{formatBytes(Number(r.bytes_in || 0))}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-400">{formatBytes(Number(r.bytes_out || 0))}</td>
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
