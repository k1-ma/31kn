import React from "react";

export default function Input({ className = "", invalid = false, ...props }) {
  return (
    <input
      className={
        "h-12 w-full rounded-xl border bg-white dark:bg-slate-800 px-4 text-base outline-none transition " +
        "placeholder:text-slate-400 text-slate-900 dark:text-slate-100 " +
        (invalid
          ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 "
          : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 ") +
        className
      }
      {...props}
    />
  );
}
