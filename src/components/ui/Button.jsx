import React from "react";

const SIZES = {
  sm: "h-8 px-3 text-xs rounded-lg",
  md: "h-10 px-4 text-sm rounded-xl",
  lg: "h-12 px-6 text-base rounded-2xl",
  icon: "h-10 w-10 rounded-xl",
};

const VARIANTS = {
  primary:
    "bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white shadow-sm shadow-emerald-500/20",
  secondary:
    "bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-900 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100",
  ghost:
    "bg-transparent hover:bg-slate-100 active:bg-slate-200 text-slate-700 dark:text-slate-200 dark:hover:bg-slate-800",
  outline:
    "border border-slate-300 dark:border-slate-700 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100",
  danger:
    "bg-red-500 hover:bg-red-600 active:bg-red-700 text-white shadow-sm shadow-red-500/20",
};

export default function Button({ variant = "primary", size = "md", className = "", ...props }) {
  if (size === "icon" && !("aria-label" in props) && typeof props.title === "string") {
    props = { ...props, "aria-label": props.title };
  }
  const base =
    "inline-flex items-center justify-center gap-2 font-semibold transition select-none " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 " +
    "disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none active:scale-[0.97]";
  return (
    <button className={`${base} ${SIZES[size] || SIZES.md} ${VARIANTS[variant] || VARIANTS.primary} ${className}`} {...props} />
  );
}
