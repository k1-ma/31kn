import React, { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { BarChart3 } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader.jsx";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card.jsx";
import EmptyState from "@/components/common/EmptyState.jsx";
import { useFinance, active } from "@/lib/finance/store.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import { monthlyCashflow, expenseByCategory } from "@/lib/finance/calc.js";
import { fromCents } from "@/lib/money.js";

export default function Analytics() {
  const { t } = useI18n();
  const { state } = useFinance();
  const baseCurrency = state.prefs?.baseCurrency || "UAH";
  const txns = state.transactions;

  const cashflow = useMemo(() => monthlyCashflow(txns, 6), [txns]);
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  const byCategory = useMemo(
    () => expenseByCategory(txns, state.categories, startOfMonth, endOfMonth),
    [txns, state.categories, startOfMonth, endOfMonth]
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
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90}>
                    {pieData.map((d, idx) => (
                      <Cell key={idx} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip />
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
                  <span className="tabular-nums">{d.value.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
