import React from "react";
import { formatMoney } from "@/lib/money.js";
import { useI18n } from "@/i18n/I18nProvider.jsx";

/**
 * Render a money amount with sign-based color and tabular nums.
 * @param {{cents: number, currency?: string, signed?: boolean, size?: "sm"|"md"|"lg"|"xl"}} props
 */
export default function AmountDisplay({
  cents,
  currency = "UAH",
  signed = false,
  size = "md",
  className = "",
}) {
  const { lang } = useI18n();
  const value = Number(cents) || 0;
  const isPositive = value > 0;
  const isNegative = value < 0;
  const sizeMap = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-2xl font-semibold",
    xl: "text-4xl font-bold tracking-tight",
  };
  const colorMap = signed
    ? isPositive
      ? "text-emerald-600 dark:text-emerald-400"
      : isNegative
        ? "text-red-600 dark:text-red-400"
        : "text-slate-700 dark:text-slate-200"
    : "text-slate-900 dark:text-slate-100";
  const prefix = signed && isPositive ? "+" : "";
  return (
    <span className={`font-mono-tabular ${sizeMap[size]} ${colorMap} ${className}`}>
      {prefix}
      {formatMoney(value, currency, lang)}
    </span>
  );
}
