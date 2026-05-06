import React from "react";

/**
 * Pulsing placeholder. Tailwind's animate-pulse is enough — no extra
 * shimmer keyframe needed.
 *
 * @param {{ className?: string, lines?: number, height?: string }} props
 */
export default function Skeleton({ className = "", lines = 1, height = "h-4" }) {
  if (lines > 1) {
    return (
      <div className={`space-y-2 ${className}`}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`${height} bg-slate-200 dark:bg-slate-800 rounded animate-pulse`}
            style={{ width: `${100 - (i * 13) % 30}%` }}
          />
        ))}
      </div>
    );
  }
  return (
    <div
      className={`${height} bg-slate-200 dark:bg-slate-800 rounded animate-pulse ${className}`}
    />
  );
}

/** A pre-shaped card skeleton for list rows. */
export function SkeletonCard({ className = "" }) {
  return (
    <div
      className={`rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 ${className}`}
    >
      <Skeleton className="w-1/3 mb-3" />
      <Skeleton height="h-7" className="w-2/3" />
    </div>
  );
}
