import React, { useEffect, useMemo, useState } from "react";
import { Ban, ShieldOff, LogOut, Trash2 } from "lucide-react";
import AdminLayout from "./AdminLayout.jsx";
import { apiJson } from "@/lib/api.js";
import Input from "@/components/ui/Input.jsx";
import Button from "@/components/ui/Button.jsx";
import Badge from "@/components/ui/Badge.jsx";
import Skeleton from "@/components/ui/Skeleton.jsx";

const PAGE_SIZE = 25;

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    apiJson("/api/admin/users")
      .then((res) => setUsers(res?.users || []))
      .catch((e) => setErr(e?.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const patchUser = (id, patch) => setUsers((p) => p.map((u) => (u.id === id ? { ...u, ...patch } : u)));

  const act = async (id, fn) => {
    setBusyId(id);
    setErr("");
    try {
      await fn();
    } catch (e) {
      setErr(e?.message || "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  const banUser = (u) =>
    act(u.id, async () => {
      const reason = window.prompt(`Ban ${u.email || u.username}? Reason:`, "");
      if (reason === null) return;
      await apiJson(`/api/admin/users/${u.id}/ban`, {
        method: "PUT",
        body: JSON.stringify({ reason: reason || "Banned by admin", disabled_until: null }),
      });
      patchUser(u.id, { is_disabled: true, disabled_reason: reason || "Banned by admin" });
    });

  const unbanUser = (u) =>
    act(u.id, async () => {
      await apiJson(`/api/admin/users/${u.id}/unban`, { method: "PUT" });
      patchUser(u.id, { is_disabled: false, disabled_reason: null, disabled_until: null });
    });

  const logoutAll = (u) =>
    act(u.id, async () => {
      await apiJson(`/api/admin/users/${u.id}/logout-all`, { method: "POST" });
    });

  const deleteUser = (u) =>
    act(u.id, async () => {
      if (!window.confirm(`Permanently delete ${u.email || u.username}? This cannot be undone.`)) return;
      await apiJson(`/api/admin/users/${u.id}`, { method: "DELETE" });
      setUsers((p) => p.filter((x) => x.id !== u.id));
    });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return users;
    return users.filter(
      (u) =>
        (u.email || "").toLowerCase().includes(term) ||
        (u.username || "").toLowerCase().includes(term)
    );
  }, [users, q]);

  useEffect(() => {
    setPage(0);
  }, [q]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <AdminLayout title="Users">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by email or username" />
      {err && <div className="text-red-400 my-3 text-sm">{err}</div>}
      {loading ? (
        <div className="mt-4">
          <Skeleton lines={6} height="h-8" />
        </div>
      ) : (
        <>
          <div className="mt-4 rounded-2xl border border-slate-800 overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-slate-900 text-xs uppercase text-slate-500 tracking-wider">
                <tr>
                  <th className="px-4 py-2 text-left">Email</th>
                  <th className="px-4 py-2 text-left">Username</th>
                  <th className="px-4 py-2 text-left">Role</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Created</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((u) => (
                  <tr key={u.id} className="border-t border-slate-800">
                    <td className="px-4 py-2">{u.email}</td>
                    <td className="px-4 py-2">{u.username}</td>
                    <td className="px-4 py-2">{u.role || "user"}</td>
                    <td className="px-4 py-2">
                      {u.is_disabled ? (
                        <Badge variant="danger">Banned</Badge>
                      ) : (
                        <Badge variant="success">Active</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-500">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : ""}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {u.is_disabled ? (
                          <Button size="sm" variant="secondary" disabled={busyId === u.id} onClick={() => unbanUser(u)} title="Unban">
                            <ShieldOff className="w-3.5 h-3.5" />
                          </Button>
                        ) : (
                          <Button size="sm" variant="secondary" disabled={busyId === u.id} onClick={() => banUser(u)} title="Ban">
                            <Ban className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button size="sm" variant="secondary" disabled={busyId === u.id} onClick={() => logoutAll(u)} title="Log out all sessions">
                          <LogOut className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="secondary" disabled={busyId === u.id} onClick={() => deleteUser(u)} title="Delete user">
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                      No users
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
