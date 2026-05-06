import React from "react";

export default function Input({ className = "", ...props }) {
  return (
    <input
      className={
        "h-12 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 text-base text-slate-900 dark:text-slate-100 outline-none " +
        "placeholder:text-slate-400 transition " +
        "focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 " +
        className
      }
      {...props}
    />
  );
}
