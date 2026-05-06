import React, { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { BarChart3 } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader.jsx";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card.jsx";
import EmptyState from "@/components/common/EmptyState.jsx";
import { useFinance, active } from "@/lib/finance/store.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { monthlyCashflow, expenseByCategory, rangeSummary } from "@/lib/finance/calc.js";
import { fromCents, formatMoney } from "@/lib/money.js";
import { rangeFromPreset } from "@/lib/finance/range.js";
import RangeBar from "@/components/ui/RangeBar.jsx";

export default function Analytics() {
  const { t, lang } = useI18n();
  const { state } = useFinance();
  const [preset, setPreset] = useState("month");
  const baseCurrency = state.prefs?.baseCurrency || "UAH";
  const txns = state.transactions;

  const range = useMemo(
    () => (typeof preset === "object" ? preset : rangeFromPreset(preset)),
    [preset]
  );
  const summary = useMemo(() => rangeSummary(txns, range.start, range.end), [txns, range]);
  const monthsForRange = useMemo(() => {
    const rangeMs = new Date(range.end).getTime() - new Date(range.start).getTime();
    const days = rangeMs / (1000 * 60 * 60 * 24);
    if (days <= 35) return 3;          // weekly/monthly → last 3 months
    if (days <= 100) return 6;         // quarter → last 6 months
    if (days <= 380) return 12;        // year → last 12 months
    return 24;                         // all/custom long → 24
  }, [range]);
  const cashflow = useMemo(
    () => monthlyCashflow(txns, monthsForRange, new Date(range.end)),
    [txns, monthsForRange, range.end]
  );
  const byCategory = useMemo(
    () => expenseByCategory(txns, state.categories, range.start, range.end),
    [txns, state.categories, range]
  );

  const hasData = active(txns).length > 0;

  if (!hasData) {
    return (
      <div className="page-enter space-y-4">
        <PageHeader title={t("nav.analytics")} />
        <EmptyState icon={BarChart3} title={t("analytics.empty")} />
      </div>
    );
  }

  const cashflowData = cashflow.map((m) => ({
    month: m.label,
    income: fromCents(m.income),
    expense: fromCents(m.expense),
  }));

  const pieData = byCategory.slice(0, 8).map((row) => ({
    name: row.category.name,
    value: fromCents(row.cents),
    color: row.category.color || "#10B981",
  }));

  return (
    <div className="page-enter space-y-4">
      <PageHeader title={t("nav.analytics")} subtitle={baseCurrency} />

      <RangeBar value={preset} onChange={setPreset} />

      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">{t("tx.income")}</div>
          <div className="text-sm font-semibold tabular-nums text-emerald-600 mt-1">
            {formatMoney(summary.income, baseCurrency, lang)}
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">{t("tx.expense")}</div>
          <div className="text-sm font-semibold tabular-nums text-red-600 mt-1">
            {formatMoney(summary.expense, baseCurrency, lang)}
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Net</div>
          <div
            className={`text-sm font-semibold tabular-nums mt-1 ${
              summary.net >= 0 ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {formatMoney(summary.net, baseCurrency, lang)}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("analytics.incomeVsExpense")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={cashflowData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip />
                <Bar dataKey="income" fill="#10B981" radius={[8, 8, 0, 0]} />
                <Bar dataKey="expense" fill="#EF4444" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {pieData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("analytics.byCategory")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={100}
                    paddingAngle={2}
                    label={({ percent }) =>
                      percent >= 0.07 ? `${Math.round(percent * 100)}%` : ""
                    }
                    labelLine={false}
                  >
                    {pieData.map((d, idx) => (
                      <Cell key={idx} fill={d.color} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) =>
                      formatMoney(Math.round(value * 100), baseCurrency, lang)
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 space-y-1.5">
              {pieData.map((d) => (
                <div key={d.name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded" style={{ background: d.color }} />
                    {d.name}
                  </span>
                  <span className="tabular-nums">
                    {formatMoney(Math.round(d.value * 100), baseCurrency, lang)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
