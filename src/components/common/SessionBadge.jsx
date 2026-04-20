import React from "react";
import { sessionTone } from "@/lib/utils";

// CSS-based glow animation class names for each tone
const glowAnimationClass = {
  green: "session-badge-glow-green",
  orange: "session-badge-glow-orange",
  purple: "session-badge-glow-purple",
  blue: "session-badge-glow-blue",
  default: "session-badge-glow-default",
};

export default function SessionBadge({ name, reduceMotion }) {
  const tone = sessionTone(name);

  // Session badges with themed colors:
  // Asia = blue, Frankfurt = purple, London = green, New York = orange
  const cls =
    tone === "green"
      ? "border border-emerald-500/40 bg-emerald-500/15 text-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.15)]"
      : tone === "orange"
      ? "border border-amber-500/40 bg-amber-500/15 text-amber-500 shadow-[0_0_10px_rgba(251,191,36,0.12)]"
      : tone === "purple"
      ? "border border-violet-500/40 bg-violet-500/15 text-violet-500 shadow-[0_0_10px_rgba(139,92,246,0.15)]"
      : tone === "blue"
      ? "border border-blue-500/40 bg-blue-500/15 text-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.15)]"
      : "border border-accent/20 bg-[#0B1220]/50 shadow-[0_0_8px_rgba(59,130,246,0.1)]";

  // Get CSS animation class for this tone (uses CSS animations instead of JS-driven Framer Motion)
  const animClass = reduceMotion ? "" : (glowAnimationClass[tone] || glowAnimationClass.default);

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium uppercase tracking-wider ${cls} ${animClass}`}>
      {name || "—"}
    </span>
  );
}
