import React from "react";
import { CircleDashed } from "lucide-react";

export function AvatarBubble({ avatar, color, size=36, isNoAccount=false }) {
  const bg = (color || "#64748b") + "22";
  const border = (color || "#64748b") + "33";
  const type = avatar?.type ?? "emoji";
  
  // Special rendering for "No Account" virtual account
  if (isNoAccount) {
    return (
      <div 
        className="grid place-items-center rounded-xl shadow-sm"
        style={{ 
          width: size, 
          height: size, 
          background: `linear-gradient(135deg, ${color}15 0%, ${color}25 100%)`,
          border: `1.5px solid ${color}40`,
          boxShadow: `0 2px 8px ${color}15, 0 0 0 1px ${color}10`,
        }}
      >
        <CircleDashed 
          className="text-amber-500/80" 
          size={size * 0.5} 
          strokeWidth={2}
        />
      </div>
    );
  }
  
  return (
    <div className="grid place-items-center rounded-xl shadow" style={{ width: size, height: size, background: bg, border: `1px solid ${border}` }}>
      {type === "image" && avatar?.imageData ? (
        <img src={avatar.imageData} alt="" className="h-[70%] w-[70%] rounded-xl object-cover" draggable={false} />
      ) : (
        <span className="select-none text-sm">{avatar?.emoji || "✨"}</span>
      )}
    </div>
  );
}

/**
 * Compact avatar + two-line label used across lists.
 *
 * Some pages (Archive/Trash) need a small visual baseline shift of the text so
 * the title sits nicer inside the card. For that, use:
 *   align="start" and textClassName="mt-1" (or mt-1.5 / mt-2)
 */
export function AvatarPill({ avatar, color, label, sub, className = "", textClassName = "", align = "center", isNoAccount = false }) {
  const alignClass = align === "start" ? "items-start" : "items-center";
  return (
    <div className={`flex ${alignClass} gap-2 min-w-0 ${className}`.trim()}>
      <AvatarBubble avatar={avatar} color={color} size={34} isNoAccount={isNoAccount} />
      <div className={`min-w-0 ${textClassName}`.trim()}>
        <div className="truncate text-sm font-semibold">{label}</div>
        {sub ? <div className="truncate text-xs text-slate-500 dark:text-slate-300">{sub}</div> : null}
      </div>
    </div>
  );
}
