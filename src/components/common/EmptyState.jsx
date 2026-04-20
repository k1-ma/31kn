import React from "react";
import { Card, CardContent } from "@/components/ui/Card.jsx";
import { HOVER_GLOW } from "@/lib/ui.js";

/**
 * Haunted empty state - mystical, dark premium feel
 */
export default function EmptyState({
  title,
  description,
  icon: Icon,
  actions,
  className = "",
}) {
  return (
    <Card className={`rounded-xl ${HOVER_GLOW} ${className}`.trim()}>
      <CardContent className="p-10 min-h-[220px] flex flex-col items-center justify-center text-center relative">
        {/* Haunted glow backdrop */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#3B82F6]/5 to-transparent rounded-xl" />
        
        {Icon ? (
          <div className="relative mb-3 h-12 w-12 rounded-xl border border-accent/25 bg-[#0B1220]/60 glass flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.15)]">
            <Icon className="h-6 w-6 text-emerald-500" />
          </div>
        ) : null}
        {title ? <div className="relative text-sm font-semibold uppercase tracking-wider">{title}</div> : null}
        {description ? (
          <div className="relative mt-2 text-sm text-muted-foreground max-w-[52ch]">{description}</div>
        ) : null}
        {actions ? <div className="relative mt-5 flex flex-wrap items-center justify-center gap-2">{actions}</div> : null}
      </CardContent>
    </Card>
  );
}
