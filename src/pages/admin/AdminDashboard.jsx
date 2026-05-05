import React, { useEffect, useState } from "react";
import AdminLayout from "./AdminLayout.jsx";
import { apiJson } from "@/lib/api.js";

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-2xl font-bold mt-1 tabular-nums">{value ?? "—"}</div>
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    apiJson("/api/admin/stats")
      .then(setStats)
      .catch((e) => setErr(e?.message || "Failed to load"));
  }, []);

  return (
    <AdminLayout title="Dashboard">
      {err && <div className="text-red-400 mb-4">{err}</div>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Total users" value={stats?.totalUsers} />
        <Stat label="Active today" value={stats?.activeToday} />
        <Stat label="Active week" value={stats?.activeWeek} />
        <Stat label="Active month" value={stats?.activeMonth} />
      </div>
    </AdminLayout>
  );
}
