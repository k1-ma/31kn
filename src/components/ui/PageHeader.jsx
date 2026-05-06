import React from "react";

export default function PageHeader({ title, subtitle, right, className = "" }) {
  return (
    <header className={`flex items-end justify-between gap-3 mb-5 ${className}`}>
      <div className="min-w-0">
        <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>
        )}
      </div>
      {right}
    </header>
  );
}
