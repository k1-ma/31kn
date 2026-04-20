import React, { useEffect, useState, useMemo, useCallback } from "react";
import { apiJson } from "@/lib/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import Input from "@/components/ui/Input.jsx";
import Button from "@/components/ui/Button.jsx";
import AdminLayout from "./AdminLayout.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { TrendingUp, Database, Clock, RefreshCcw, Calendar, ArrowUpDown } from "lucide-react";
import { motion } from "framer-motion";
import { formatBytes, formatMs } from "@/lib/adminUtils.js";

function UsageRow({ stat, index }) {
  return (
    <motion.tr
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02 }}
      className="border-b border-border/30 hover:bg-muted/10"
    >
      <td className="py-3 px-4 text-sm">{stat.day}</td>
      <td className="py-3 px-4 text-sm">
        {stat.username || <span className="text-muted-foreground italic">Guest</span>}
      </td>
      <td className="py-3 px-4 text-sm font-mono text-xs">{stat.ip || "—"}</td>
      <td className="py-3 px-4 text-sm text-right font-semibold">{stat.requests.toLocaleString()}</td>
      <td className="py-3 px-4 text-sm text-right">{formatBytes(stat.bytes_in)}</td>
      <td className="py-3 px-4 text-sm text-right">{formatBytes(stat.bytes_out)}</td>
      <td className="py-3 px-4 text-sm text-right">
        {stat.requests > 0 ? formatMs(Math.round(stat.total_ms / stat.requests)) : "—"}
      </td>
    </motion.tr>
  );
}

export default function AdminUsage() {
  const { t } = useI18n();
  const [stats, setStats] = useState([]);
  const [totals, setTotals] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filters
  const [dayFrom, setDayFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [dayTo, setDayTo] = useState(() => new Date().toISOString().split("T")[0]);
  
  // Sorting
  const [sortField, setSortField] = useState("requests");
  const [sortOrder, setSortOrder] = useState("desc");

  // Only load on mount and explicit apply/refresh
  useEffect(() => {
    loadStats();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleApply = useCallback(() => {
    loadStats();
  }, [dayFrom, dayTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dayFrom) params.set("dayFrom", dayFrom);
      if (dayTo) params.set("dayTo", dayTo);
      
      const data = await apiJson(`/api/admin/usage?${params}`);
      setStats(data.stats || []);
      setTotals(data.totals || {});
    } catch (e) {
      setError(e?.message || "Failed to load usage statistics");
    } finally {
      setLoading(false);
    }
  };

  const sortedStats = useMemo(() => {
    const sorted = [...stats].sort((a, b) => {
      let aVal = a[sortField] ?? 0;
      let bVal = b[sortField] ?? 0;
      if (sortField === "day") {
        aVal = new Date(a.day).getTime();
        bVal = new Date(b.day).getTime();
      }
      if (sortField === "avg_ms") {
        aVal = a.requests > 0 ? a.total_ms / a.requests : 0;
        bVal = b.requests > 0 ? b.total_ms / b.requests : 0;
      }
      if (sortOrder === "asc") return aVal - bVal;
      return bVal - aVal;
    });
    return sorted;
  }, [stats, sortField, sortOrder]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const SortHeader = ({ field, children }) => (
    <th
      className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition"
      onClick={() => handleSort(field)}
    >
      <span className="flex items-center gap-1">
        {children}
        {sortField === field && (
          <ArrowUpDown className={`h-3 w-3 ${sortOrder === "asc" ? "rotate-180" : ""}`} />
        )}
      </span>
    </th>
  );

  return (
    <AdminLayout
      title={t("admin.nav.usage", null, "Usage")}
      subtitle={t("admin.pages.usage.subtitle", null, "API usage and load statistics")}
    >
        {/* Totals */}
        <div className="grid gap-4 sm:grid-cols-4 mb-6">
          <div className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm shadow-xl shadow-black/5 p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">
              {t("admin.pages.usage.totalRequests", null, "Total Requests")}
            </div>
            <div className="text-2xl font-bold mt-1">
              {(totals.total_requests || 0).toLocaleString()}
            </div>
          </div>
          <div className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm shadow-xl shadow-black/5 p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">
              {t("admin.pages.usage.bytesIn", null, "Bytes In")}
            </div>
            <div className="text-2xl font-bold mt-1">
              {formatBytes(totals.total_bytes_in || 0)}
            </div>
          </div>
          <div className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm shadow-xl shadow-black/5 p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">
              {t("admin.pages.usage.bytesOut", null, "Bytes Out")}
            </div>
            <div className="text-2xl font-bold mt-1">
              {formatBytes(totals.total_bytes_out || 0)}
            </div>
          </div>
          <div className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm shadow-xl shadow-black/5 p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">
              {t("admin.pages.usage.avgLatency", null, "Avg Latency")}
            </div>
            <div className="text-2xl font-bold mt-1">
              {totals.total_requests > 0 
                ? formatMs(Math.round((totals.total_ms || 0) / totals.total_requests))
                : "—"
              }
            </div>
          </div>
        </div>

        {/* Filters */}
        <Card className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm shadow-xl shadow-black/5 mb-6">
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                {t("admin.pages.usage.filter", null, "Filter")}
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-xl"
                onClick={loadStats}
                title={t("common.refresh", null, "Refresh")}
              >
                <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("admin.pages.usage.from", null, "From")}
                </label>
                <Input
                  type="date"
                  value={dayFrom}
                  onChange={(e) => setDayFrom(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {t("admin.pages.usage.to", null, "To")}
                </label>
                <Input
                  type="date"
                  value={dayTo}
                  onChange={(e) => setDayTo(e.target.value)}
                  className="mt-1"
                />
              </div>
              <Button onClick={handleApply} className="rounded-xl">
                {t("admin.pages.dashboard.apply", null, "Apply")}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Data Table */}
        <Card className="rounded-2xl border border-border/40 bg-card/50 backdrop-blur-sm shadow-xl shadow-black/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              {t("admin.pages.usage.data", null, "Usage Data")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 mb-4">
                {error}
              </div>
            )}

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-12 rounded-xl bg-muted/20 animate-pulse" />
                ))}
              </div>
            ) : sortedStats.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground flex flex-col items-center gap-2">
                <TrendingUp className="h-12 w-12 opacity-30" />
                <p>{t("admin.pages.usage.noData", null, "No usage data for selected period")}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="sticky top-0 bg-card/80 backdrop-blur-sm">
                    <tr className="border-b border-border/50">
                      <SortHeader field="day">{t("admin.pages.usage.date", null, "Date")}</SortHeader>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {t("admin.pages.usage.user", null, "User")}
                      </th>
                      <th className="py-3 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        {t("admin.pages.usage.ip", null, "IP")}
                      </th>
                      <SortHeader field="requests">{t("admin.pages.usage.requests", null, "Requests")}</SortHeader>
                      <SortHeader field="bytes_in">{t("admin.pages.usage.in", null, "In")}</SortHeader>
                      <SortHeader field="bytes_out">{t("admin.pages.usage.out", null, "Out")}</SortHeader>
                      <SortHeader field="avg_ms">{t("admin.pages.usage.avgMs", null, "Avg ms")}</SortHeader>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedStats.slice(0, 100).map((stat, i) => (
                      <UsageRow key={`${stat.day}-${stat.user_id}-${stat.ip}`} stat={stat} index={i} />
                    ))}
                  </tbody>
                </table>
                {sortedStats.length > 100 && (
                  <div className="text-center py-4 text-sm text-muted-foreground">
                    {t("admin.pages.usage.showingFirst", null, "Showing first 100 of")} {sortedStats.length} {t("admin.pages.usage.records", null, "records")}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
    </AdminLayout>
  );
}
