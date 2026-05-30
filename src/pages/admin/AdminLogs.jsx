import React, { useEffect, useMemo, useState } from "react";
import AdminLayout from "./AdminLayout.jsx";
import { apiJson } from "@/lib/api.js";
import Input from "@/components/ui/Input.jsx";
import Button from "@/components/ui/Button.jsx";
import Skeleton from "@/components/ui/Skeleton.jsx";

const PAGE_SIZE = 25;

export default function AdminLogs() {
  const [logs, setLogs] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    apiJson("/api/admin/logs?limit=100")
      .then((res) => setLogs(res?.logs || []))
      .catch((e) => setErr(e?.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return logs;
    return logs.filter(
      (l) =>
        (l.action || "").toLowerCase().includes(term) ||
        (l.actor_email || l.actor_id || "").toString().toLowerCase().includes(term)
    );
  }, [logs, q]);

  useEffect(() => {
    setPage(0);
  }, [q]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <AdminLayout title="Logs">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by action or actor" />
      {err && <div className="text-red-400 my-3">{err}</div>}
      {loading ? (
        <div className="mt-4">
          <Skeleton lines={6} height="h-8" />
        </div>
      ) : (
        <>
          <div className="mt-4 rounded-2xl border border-slate-800 overflow-hidden">
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
                {visible.map((l, i) => (
                  <tr key={l.id || i} className="border-t border-slate-800">
                    <td className="px-4 py-2 text-slate-500">{l.created_at}</td>
                    <td className="px-4 py-2">{l.actor_email || l.actor_id || "system"}</td>
                    <td className="px-4 py-2">{l.action}</td>
                    <td className="px-4 py-2 text-slate-400 truncate max-w-md">{l.detail || ""}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                      No logs
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {filtered.length > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <div className="text-xs text-slate-500">
                {safePage * PAGE_SIZE + 1}–{Math.min(filtered.length, safePage * PAGE_SIZE + PAGE_SIZE)} of {filtered.length}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={safePage <= 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Previous
                </Button>
                <span className="text-xs text-slate-500">
                  Page {safePage + 1} / {pageCount}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
}
