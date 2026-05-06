import React from "react";

export function Card({ className = "", ...props }) {
  return (
    <div
      className={
        "rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_1px_2px_rgba(20,20,40,0.04),0_1px_1px_rgba(20,20,40,0.03)] " +
        className
      }
      {...props}
    />
  );
}

export function CardHeader({ className = "", ...props }) {
  return <div className={"px-5 pt-5 pb-2 " + className} {...props} />;
}

export function CardTitle({ className = "", ...props }) {
  return (
    <div
      className={"text-base font-semibold text-slate-900 dark:text-slate-100 font-display " + className}
      {...props}
    />
  );
}

export function CardContent({ className = "", ...props }) {
  return <div className={"px-5 pb-5 pt-1 " + className} {...props} />;
}
