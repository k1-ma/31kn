import React from "react";
import { paletteToCssVars, COLOR_KEYS } from "@/lib/theme.js";

/**
 * Renders a miniature UI preview using the given palette, 
 * isolated from the main app via inline CSS variables.
 */
export default function ThemeLivePreview({ palette, className = "" }) {
  if (!palette) return null;

  // Build inline style with CSS vars from the palette
  const vars = paletteToCssVars(palette);
  const style = {};
  for (const [k, v] of Object.entries(vars)) {
    style[k] = v;
  }

  const rgb = (token) => `rgb(${vars[`--${token}`] || "0 0 0"})`;
  const rgba = (token, a) => `rgba(${(vars[`--${token}`] || "0 0 0").replace(/ /g, ",")},${a})`;

  return (
    <div className={"rounded-xl overflow-hidden border border-border/30 " + className} style={style}>
      {/* Mini header */}
      <div className="flex items-center gap-2 px-3 py-2" style={{ background: rgb("card") }}>
        <div className="h-2.5 w-2.5 rounded-full" style={{ background: rgb("accent") }} />
        <div className="h-1.5 flex-1 rounded-full" style={{ background: rgba("muted-fg", 0.3) }} />
        <div className="h-5 w-12 rounded-md text-[8px] font-semibold flex items-center justify-center"
          style={{ background: rgb("accent"), color: rgb("on-accent") }}>
          Button
        </div>
      </div>

      {/* Mini body */}
      <div className="px-3 py-2 space-y-2" style={{ background: rgb("bg") }}>
        {/* Stat cards row */}
        <div className="flex gap-1.5">
          <div className="flex-1 rounded-md p-1.5" style={{ background: rgb("card"), border: `1px solid ${rgba("border", 0.5)}` }}>
            <div className="text-[7px] font-bold" style={{ color: rgb("success") }}>+12.5%</div>
            <div className="h-1 w-8 rounded-full mt-0.5" style={{ background: rgba("success", 0.2) }} />
          </div>
          <div className="flex-1 rounded-md p-1.5" style={{ background: rgb("card"), border: `1px solid ${rgba("border", 0.5)}` }}>
            <div className="text-[7px] font-bold" style={{ color: rgb("danger") }}>-3.2%</div>
            <div className="h-1 w-6 rounded-full mt-0.5" style={{ background: rgba("danger", 0.2) }} />
          </div>
        </div>

        {/* Mini chart */}
        <div className="rounded-md p-1.5" style={{ background: rgb("card"), border: `1px solid ${rgba("border", 0.5)}` }}>
          <svg viewBox="0 0 100 24" className="w-full h-6">
            <polyline points="0,20 20,12 40,16 60,8 80,14 100,4" fill="none" stroke={rgb("chart-1")} strokeWidth="1.5" />
            <polyline points="0,18 20,16 40,10 60,14 80,6 100,12" fill="none" stroke={rgb("chart-2")} strokeWidth="1.5" />
            <polyline points="0,22 20,18 40,20 60,12 80,18 100,10" fill="none" stroke={rgb("chart-3")} strokeWidth="1" strokeDasharray="2,2" />
            <polyline points="0,14 20,20 40,14 60,18 80,10 100,16" fill="none" stroke={rgb("chart-4")} strokeWidth="1" strokeDasharray="2,2" />
          </svg>
        </div>

        {/* Mini badges */}
        <div className="flex gap-1 flex-wrap">
          <span className="inline-block rounded-md px-1.5 py-0.5 text-[7px] font-bold"
            style={{ background: rgba("success", 0.15), color: rgb("success") }}>
            Win
          </span>
          <span className="inline-block rounded-md px-1.5 py-0.5 text-[7px] font-bold"
            style={{ background: rgba("danger", 0.15), color: rgb("danger") }}>
            Loss
          </span>
          <span className="inline-block rounded-md px-1.5 py-0.5 text-[7px] font-bold"
            style={{ background: rgba("warning", 0.15), color: rgb("warning") }}>
            BE
          </span>
          <span className="inline-block rounded-md px-1.5 py-0.5 text-[7px] font-bold"
            style={{ background: rgba("accent", 0.15), color: rgb("accent") }}>
            Tag
          </span>
        </div>

        {/* Mini input */}
        <div className="rounded-md px-2 py-1 text-[7px]"
          style={{
            background: rgba("muted", 0.3),
            border: `1px solid ${rgba("border", 0.5)}`,
            color: rgba("muted-fg", 0.5),
          }}>
          Search...
        </div>
      </div>
    </div>
  );
}
