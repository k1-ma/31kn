import React, { useEffect, useState } from "react";
import AdminLayout from "./AdminLayout.jsx";
import { apiJson } from "@/lib/api.js";
import Skeleton from "@/components/ui/Skeleton.jsx";

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-2xl font-bold mt-1 tabular-nums">{value ?? "—"}</div>
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

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiJson("/api/admin/stats")
      .then(setStats)
      .catch((e) => setErr(e?.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AdminLayout title="Dashboard">
      {err && <div className="text-red-400 mb-4">{err}</div>}
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatSkeleton />
          <StatSkeleton />
          <StatSkeleton />
          <StatSkeleton />
        </div>
      ) : !stats ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center text-slate-500">
          {err ? "Could not load stats." : "No stats available."}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="Total users" value={stats?.totalUsers} />
          <Stat label="Active today" value={stats?.activeToday} />
          <Stat label="Active week" value={stats?.activeWeek} />
          <Stat label="Active month" value={stats?.activeMonth} />
        </div>
      )}
    </AdminLayout>
  );
}
