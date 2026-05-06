import React from "react";

export default function EmptyState({ title, description, icon: Icon, actions, className = "" }) {
  return (
    <div
      className={`rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-10 flex flex-col items-center justify-center text-center ${className}`}
    >
      {Icon && (
        <div className="mb-4 h-14 w-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center">
          <Icon className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
        </div>
      )}
      {title && (
        <div className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</div>
      )}
      {description && (
        <div className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-md">{description}</div>
      )}
      {actions && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
    </div>
  );
}
