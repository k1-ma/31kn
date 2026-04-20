import React from "react";

export default function Input({ className = "", ...props }) {
  return (
    <input
      className={
        "h-9 w-full rounded-lg border border-border/50 dark:border-white/[0.08] bg-muted/30 dark:bg-white/[0.03] px-3 text-[13px] text-foreground outline-none " +
        "placeholder:text-muted-foreground/50 transition-all duration-200 " +
        "shadow-sm dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.15)] " +
        "focus:border-accent/50 focus:ring-1 focus:ring-accent/25 focus:bg-card dark:focus:bg-white/[0.05] " +
        "hover:border-border dark:hover:border-white/[0.14] " +
        className
      }
      {...props}
    />
  );
}
