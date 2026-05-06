import React from "react";
import Button from "@/components/ui/Button.jsx";

export default function EmptyState({
  title,
  description,
  icon: Icon,
  actions,
  cta,
  className = "",
}) {
  return (
    <div
      className={`rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-10 flex flex-col items-center justify-center text-center ${className}`}
    >
      {Icon && (
        <div className="mb-4 h-14 w-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center">
          <Icon className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
        </div>
      )}
      {title && (
        <div className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</div>
      )}
      {description && (
        <div className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-md">{description}</div>
      )}
      {cta && (
        <Button onClick={cta.onClick} className="mt-5">
          {cta.label}
        </Button>
      )}
      {actions && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
    </div>
  );
}
