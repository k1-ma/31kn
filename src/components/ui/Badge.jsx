import React from "react";

const VARIANTS = {
  brand:
    "bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900",
  outline:
    "bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900",
  solid: "bg-indigo-500 text-white border border-indigo-500",
  secondary:
    "bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300",
  success:
    "bg-emerald-50 dark:bg-emerald-950 border border-emerald-100 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300",
  warning:
    "bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300",
  danger:
    "bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300",
};

export default function Badge({ variant = "outline", className = "", children, ...props }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider " +
        (VARIANTS[variant] || VARIANTS.outline) +
        " " +
        className
      }
      {...props}
    >
      {children}
    </span>
  );
}
