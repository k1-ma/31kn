import React from "react";

/** Skeleton — premium loading placeholder with subtle shimmer. */
export default function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-xl bg-muted/50 dark:bg-white/[0.03] border border-border/20 dark:border-white/[0.03] ${className}`} />;
}
