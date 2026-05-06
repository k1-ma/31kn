import React from "react";

/**
 * SVG ring used by Dashboard, Budgets, and Goals to show percent
 * progress at a glance. Mirrors the `Ring` component in the design canvas.
 * Color follows brand by default; pass `color` to tint per-budget.
 */
export default function ProgressRing({
  pct = 0,
  size = 88,
  stroke = 8,
  color,
  trackColor,
  label,
  className = "",
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(Math.max(pct, 0), 100) / 100) * circumference;
  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          stroke={trackColor || "var(--surface-3)"}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke={color || "var(--brand)"}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 340ms cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono font-semibold text-slate-900 dark:text-slate-100">
        {label ?? `${Math.round(pct)}%`}
      </span>
    </div>
  );
}
