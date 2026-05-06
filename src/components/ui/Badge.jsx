import React from "react";

const VARIANTS = {
  outline:
    "border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
  solid: "bg-emerald-500 text-white border border-emerald-500",
  secondary:
    "bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300",
  warning:
    "bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300",
  danger:
    "bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300",
};

export default function Badge({ variant = "outline", className = "", children, ...props }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide " +
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
