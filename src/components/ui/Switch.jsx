import React from "react";
export default function Switch({ checked, onCheckedChange, ...rest }) {
  return (
    <button
      type="button"
      onClick={() => onCheckedChange?.(!checked)}
      className={
        "relative inline-flex h-[26px] w-12 items-center rounded-full border transition-all duration-200 " +
        (checked
          ? "bg-indigo-500 border-indigo-500/40 shadow-sm"
          : "bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600")
      }
      aria-pressed={!!checked}
      {...rest}
    >
      <span className={
        "inline-block h-[20px] w-[20px] transform rounded-full transition-all duration-200 bg-white shadow-sm " +
        (checked ? "translate-x-[23px]" : "translate-x-[3px]")
      } />
    </button>
  );
}
