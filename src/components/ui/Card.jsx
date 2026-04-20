import React from "react";

/**
 * Card — Premium container with depth
 */
export function Card({ className = "", ...props }) {
  return (
    <div
      className={
        "rounded-xl border border-border/50 dark:border-white/[0.06] bg-card/95 dark:bg-[#131722]/90 " +
        "shadow-sm dark:shadow-[0_2px_16px_rgba(0,0,0,0.2)] " +
        "transition-all duration-200 " +
        "hover:border-border dark:hover:border-white/[0.09] hover:shadow-md dark:hover:shadow-[0_4px_24px_rgba(0,0,0,0.25)] " +
        className
      }
      {...props}
    />
  );
}

export function CardHeader({ className = "", ...props }) {
  return <div className={"px-5 pt-4 pb-2 " + className} {...props} />;
}

export function CardTitle({ className = "", ...props }) {
  return <div className={"text-[13px] font-semibold text-foreground tracking-wide " + className} {...props} />;
}

export function CardContent({ className = "", ...props }) {
  return <div className={"px-5 pb-4 pt-0 " + className} {...props} />;
}
