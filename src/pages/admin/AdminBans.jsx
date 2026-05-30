import React, { useEffect, useState } from "react";
import AdminLayout from "./AdminLayout.jsx";
import { apiJson } from "@/lib/api.js";
import Button from "@/components/ui/Button.jsx";
import Badge from "@/components/ui/Badge.jsx";
import Skeleton from "@/components/ui/Skeleton.jsx";

const PAGE_SIZE = 25;

export default function AdminBans() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  useEffect(() => {
    apiJson("/api/admin/bans")
      .then((res) => setItems(res?.bans || []))
      .catch((e) => setErr(e?.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = items.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <AdminLayout title="Bans">
      {err && <div className="text-red-400">{err}</div>}
      {loading ? (
        <Skeleton lines={6} height="h-8" />
      ) : items.length === 0 ? (
        <div className="text-slate-500">No bans</div>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-900 text-xs uppercase text-slate-500 tracking-wider">
                <tr>
                  <th className="px-4 py-2 text-left">User</th>
                  <th className="px-4 py-2 text-left">Type</th>
                  <th className="px-4 py-2 text-left">Reason</th>
                  <th className="px-4 py-2 text-left">Until</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((b) => (
                  <tr key={b.id} className="border-t border-slate-800">
                    <td className="px-4 py-2">{b.user_email || b.user_id}</td>
                    <td className="px-4 py-2">
                      {b.expires_at ? (
                        <Badge variant="warning">Temporary</Badge>
                      ) : (
                        <Badge variant="danger">Permanent</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-400">{b.reason || "—"}</td>
                    <td className="px-4 py-2 text-slate-500">{b.expires_at || "permanent"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs text-slate-500">
              {safePage * PAGE_SIZE + 1}–{Math.min(items.length, safePage * PAGE_SIZE + PAGE_SIZE)} of {items.length}
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
        </>
      )}
    </AdminLayout>
  );
}
