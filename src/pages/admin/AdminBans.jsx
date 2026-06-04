import React, { useEffect, useState } from "react";
import { Ban, ShieldOff, Plus, Trash2 } from "lucide-react";
import AdminLayout from "./AdminLayout.jsx";
import { apiJson } from "@/lib/api.js";
import Button from "@/components/ui/Button.jsx";
import Input from "@/components/ui/Input.jsx";
import Badge from "@/components/ui/Badge.jsx";
import Skeleton from "@/components/ui/Skeleton.jsx";

function SectionCard({ icon: Icon, title, action, children }) {
  return (
    <div className="rounded-2xl border border-slate-800 overflow-hidden">
      <div className="bg-slate-900 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
          {Icon && <Icon className="w-4 h-4 text-slate-400" />}
          {title}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export default function AdminBans() {
  const [bannedUsers, setBannedUsers] = useState([]);
  const [ipBans, setIpBans] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // New IP-ban form
  const [ip, setIp] = useState("");
  const [reason, setReason] = useState("");
  const [expires, setExpires] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([
      apiJson("/api/admin/users").then((r) => r?.users || []),
      apiJson("/api/admin/bans/ip").then((r) => r?.bans || []),
    ])
      .then(([users, ips]) => {
        setBannedUsers(users.filter((u) => u.is_disabled));
        setIpBans(ips);
      })
      .catch((e) => setErr(e?.message || "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const unbanUser = async (id) => {
    setBusy(true);
    setErr("");
    try {
      await apiJson(`/api/admin/users/${id}/unban`, { method: "PUT" });
      setBannedUsers((p) => p.filter((u) => u.id !== id));
    } catch (e) {
      setErr(e?.message || "Failed to unban");
    } finally {
      setBusy(false);
    }
  };

  const addIpBan = async (e) => {
    e.preventDefault();
    if (!ip.trim()) return;
    setBusy(true);
    setErr("");
    try {
      const res = await apiJson("/api/admin/bans/ip", {
        method: "POST",
        body: JSON.stringify({
          ip: ip.trim(),
          reason: reason.trim() || undefined,
          expires_at: expires ? new Date(expires).toISOString() : undefined,
        }),
      });
      if (res?.ban) setIpBans((p) => [res.ban, ...p]);
      setIp("");
      setReason("");
      setExpires("");
    } catch (e2) {
      setErr(e2?.message || "Failed to add IP ban");
    } finally {
      setBusy(false);
    }
  };

  const removeIpBan = async (id) => {
    setBusy(true);
    setErr("");
    try {
      await apiJson(`/api/admin/bans/ip/${id}`, { method: "DELETE" });
      setIpBans((p) => p.filter((b) => b.id !== id));
    } catch (e) {
      setErr(e?.message || "Failed to remove IP ban");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminLayout title="Bans">
      {err && <div className="text-red-400 mb-4 text-sm">{err}</div>}

      {loading ? (
        <Skeleton lines={6} height="h-8" />
      ) : (
        <div className="space-y-6">
          {/* Banned users */}
          <SectionCard icon={Ban} title={`Banned users (${bannedUsers.length})`}>
            <table className="w-full text-sm">
              <thead className="bg-slate-900/60 text-xs uppercase text-slate-500 tracking-wider">
                <tr>
                  <th className="px-4 py-2 text-left">User</th>
                  <th className="px-4 py-2 text-left">Type</th>
                  <th className="px-4 py-2 text-left">Reason</th>
                  <th className="px-4 py-2 text-left">Until</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {bannedUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-500">No banned users</td>
                  </tr>
                ) : (
                  bannedUsers.map((u) => (
                    <tr key={u.id} className="border-t border-slate-800">
                      <td className="px-4 py-2">{u.email || u.username || `#${u.id}`}</td>
                      <td className="px-4 py-2">
                        {u.disabled_until ? <Badge variant="warning">Temporary</Badge> : <Badge variant="danger">Permanent</Badge>}
                      </td>
                      <td className="px-4 py-2 text-slate-400">{u.disabled_reason || "—"}</td>
                      <td className="px-4 py-2 text-slate-500">
                        {u.disabled_until ? new Date(u.disabled_until).toLocaleString() : "permanent"}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button size="sm" variant="secondary" disabled={busy} onClick={() => unbanUser(u.id)}>
                          <ShieldOff className="w-3.5 h-3.5 mr-1" /> Unban
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </SectionCard>

          {/* IP bans */}
          <SectionCard icon={Ban} title={`IP bans (${ipBans.length})`}>
            <form onSubmit={addIpBan} className="px-5 py-4 border-b border-slate-800 grid sm:grid-cols-[1fr_1fr_auto_auto] gap-3 items-end">
              <div>
                <label className="text-xs text-slate-500 mb-1 inline-block">IP address</label>
                <Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="203.0.113.4" required />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 inline-block">Reason (optional)</label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="abuse" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 inline-block">Expires (optional)</label>
                <input
                  type="datetime-local"
                  value={expires}
                  onChange={(e) => setExpires(e.target.value)}
                  className="h-12 rounded-xl border border-slate-700 bg-slate-800 px-3 text-sm text-slate-100"
                />
              </div>
              <Button type="submit" disabled={busy || !ip.trim()}>
                <Plus className="w-4 h-4 mr-1" /> Ban IP
              </Button>
            </form>
            <table className="w-full text-sm">
              <thead className="bg-slate-900/60 text-xs uppercase text-slate-500 tracking-wider">
                <tr>
                  <th className="px-4 py-2 text-left">IP</th>
                  <th className="px-4 py-2 text-left">Type</th>
                  <th className="px-4 py-2 text-left">Reason</th>
                  <th className="px-4 py-2 text-left">Until</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {ipBans.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-500">No IP bans</td>
                  </tr>
                ) : (
                  ipBans.map((b) => (
                    <tr key={b.id} className="border-t border-slate-800">
                      <td className="px-4 py-2 font-mono text-xs">{b.ip}</td>
                      <td className="px-4 py-2">
                        {b.expires_at ? <Badge variant="warning">Temporary</Badge> : <Badge variant="danger">Permanent</Badge>}
                      </td>
                      <td className="px-4 py-2 text-slate-400">{b.reason || "—"}</td>
                      <td className="px-4 py-2 text-slate-500">
                        {b.expires_at ? new Date(b.expires_at).toLocaleString() : "permanent"}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button size="sm" variant="secondary" disabled={busy} onClick={() => removeIpBan(b.id)}>
                          <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </SectionCard>
        </div>
      )}
    </AdminLayout>
  );
}
