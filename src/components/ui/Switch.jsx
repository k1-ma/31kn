import React from "react";

/**
 * Toggle switch. Emerald when on, slate when off.
 *
 * @param {{ checked: boolean, onCheckedChange: (next: boolean) => void, disabled?: boolean, "aria-label"?: string }} props
 */
export default function Switch({ checked, onCheckedChange, disabled, ...rest }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      disabled={disabled}
      onClick={() => !disabled && onCheckedChange?.(!checked)}
      className={
        "relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 " +
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 " +
        "disabled:opacity-40 disabled:cursor-not-allowed " +
        (checked ? "bg-emerald-500" : "bg-slate-200 dark:bg-slate-700")
      }
      {...rest}
    >
      <span
        className={
          "inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 " +
          (checked ? "translate-x-6" : "translate-x-1")
        }
      />
    </button>
  );
}
