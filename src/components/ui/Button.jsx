import React from "react";

const SIZES = {
  sm: "h-8 px-3 text-xs rounded-lg",
  md: "h-10 px-4 text-sm rounded-xl",
  lg: "h-12 px-6 text-base rounded-2xl",
  xl: "h-14 px-7 text-base rounded-2xl w-full",
  icon: "h-10 w-10 rounded-xl",
};

const VARIANTS = {
  primary:
    "bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 text-white shadow-sm shadow-indigo-500/25 hover:shadow-lg hover:shadow-indigo-500/30",
  soft:
    "bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 text-indigo-600 dark:bg-indigo-950 dark:hover:bg-indigo-900 dark:text-indigo-300",
  secondary:
    "bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 border border-slate-200 dark:border-slate-700",
  ghost:
    "bg-transparent hover:bg-slate-100 active:bg-slate-200 text-slate-700 dark:text-slate-200 dark:hover:bg-slate-800",
  outline:
    "border border-slate-300 dark:border-slate-600 bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100",
  danger:
    "bg-red-500 hover:bg-red-600 active:bg-red-700 text-white shadow-sm shadow-red-500/20",
};

export default function Button({ variant = "primary", size = "md", className = "", ...props }) {
  if (size === "icon" && !("aria-label" in props) && typeof props.title === "string") {
    props = { ...props, "aria-label": props.title };
  }
  const base =
    "inline-flex items-center justify-center gap-2 font-semibold transition-all select-none " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 " +
    "disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none active:scale-[0.97]";
  return (
    <button className={`${base} ${SIZES[size] || SIZES.md} ${VARIANTS[variant] || VARIANTS.primary} ${className}`} {...props} />
  );
}
