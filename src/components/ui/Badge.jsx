import React from "react";

export default function Badge({ variant = "outline", className = "", children, ...props }) {
  const v = {
    outline: "border border-accent/25 bg-accent/8 text-accent",
    secondary: "bg-muted/50 dark:bg-white/[0.04] border border-border/50 dark:border-white/[0.08] text-muted-foreground",
    solid: "bg-accent text-on-accent border border-accent/40",
    default: "bg-accent text-on-accent border border-accent/40",
    destructive: "bg-red-500/8 text-red-600 dark:text-red-400 border border-red-500/20",
    warning: "bg-amber-500/8 text-amber-600 dark:text-amber-400 border border-amber-500/20",
    success: "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
    win: "bg-emerald-500/8 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
    loss: "bg-red-500/8 text-red-600 dark:text-red-400 border border-red-500/20",
    be: "bg-slate-500/8 text-slate-600 dark:text-slate-400 border border-slate-500/20",
  }[variant] || "border border-accent/25 bg-accent/8 text-accent";

  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide " +
        v +
        " " +
        className
      }
      {...props}
    >
      {children}
    </span>
  );
}
