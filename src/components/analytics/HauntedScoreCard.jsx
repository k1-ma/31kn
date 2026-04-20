import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/Card.jsx";
import { computeHauntedScore } from "@/lib/hauntedScore.js";
import hauntedLogo from "@/assets/haunted.png";
import { fadeUp } from "@/components/common/motion";

// Module-level constant — stable reference, never re-created
const DIAMOND_AXES = [
  { key: "consistency", label: "Consistency", angle: -90 },  // top
  { key: "rr", label: "RR", angle: 0 },                      // right
  { key: "wr", label: "WR", angle: 90 },                     // bottom
  { key: "slUsage", label: "SL Usage", angle: 180 },         // left
];

/**
 * Diamond Radar Chart SVG Component
 * Renders a FundingPips-style diamond (rhombus) radar with 4 axes
 * LARGE and centered - fills its container using viewBox scaling
 */
function DiamondRadar({ metrics, reduceMotion }) {
  const [hovered, setHovered] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // SVG viewBox dimensions (internal coordinate system)
  // Expanded viewBox to give labels breathing room (especially SL Usage on left)
  const viewBoxSize = 240;
  const center = viewBoxSize / 2;
  const maxRadius = 80; // Diamond radius - sized for balance with label space

  // Diamond vertices (4 axes): top, right, bottom, left — stable reference
  const axes = DIAMOND_AXES;

  // Convert angle and radius to SVG coordinates (pure function of constants)
  const polarToCartesian = (angleDeg, radius) => {
    const angleRad = (angleDeg * Math.PI) / 180;
    return {
      x: center + radius * Math.cos(angleRad),
      y: center + radius * Math.sin(angleRad),
    };
  };

  // Memoize all static SVG geometry (grid + axis lines) — they never change
  const { gridPolygons, axisLines } = useMemo(() => {
    const gridLevels = [0.25, 0.5, 0.75, 1.0];
    const gp = gridLevels.map((level) => {
      const points = DIAMOND_AXES
        .map((axis) => {
          const pt = polarToCartesian(axis.angle, maxRadius * level);
          return `${pt.x},${pt.y}`;
        })
        .join(" ");
      return points;
    });
    const al = DIAMOND_AXES.map((axis) => {
      const pt = polarToCartesian(axis.angle, maxRadius);
      return { x1: center, y1: center, x2: pt.x, y2: pt.y };
    });
    return { gridPolygons: gp, axisLines: al };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Memoize value-dependent SVG data (changes only when metrics change)
  const { valuePolygon, valueDots, labelPositions, hasMetrics } = useMemo(() => {
    const _hasMetrics = metrics && metrics.consistency !== null;
    const emptyStateValue = 0.2;
    
    const _valuePolygon = DIAMOND_AXES
      .map((axis) => {
        const value = _hasMetrics 
          ? (metrics[axis.key] || 0) / 100 
          : emptyStateValue;
        const pt = polarToCartesian(axis.angle, maxRadius * Math.max(value, 0.05));
        return `${pt.x},${pt.y}`;
      })
      .join(" ");

    const _valueDots = _hasMetrics
      ? DIAMOND_AXES.map((axis) => {
          const value = (metrics[axis.key] || 0) / 100;
          return {
            ...polarToCartesian(axis.angle, maxRadius * Math.max(value, 0.05)),
            key: axis.key,
            label: axis.label,
            value: metrics[axis.key],
          };
        })
      : [];

    const labelOffset = 16;
    const _labelPositions = DIAMOND_AXES.map((axis) => {
      const pt = polarToCartesian(axis.angle, maxRadius + labelOffset);
      return {
        x: pt.x,
        y: pt.y,
        label: axis.label,
        key: axis.key,
        value: _hasMetrics ? metrics[axis.key] : null,
      };
    });

    return { valuePolygon: _valuePolygon, valueDots: _valueDots, labelPositions: _labelPositions, hasMetrics: _hasMetrics };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics]);

  const handleMouseMove = (e, key) => {
    const rect = e.currentTarget.ownerSVGElement.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setHovered(key);
  };

  const handleMouseLeave = () => {
    setHovered(null);
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
        preserveAspectRatio="xMidYMid meet"
        className="overflow-visible"
        style={{ maxWidth: '100%', maxHeight: '100%' }}
      >
        {/* Gradient definitions */}
        <defs>
          <linearGradient id="hauntedGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgb(59, 130, 246)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="rgb(79, 70, 229)" stopOpacity="0.15" />
          </linearGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Grid polygons (nested diamonds) */}
        {gridPolygons.map((points, idx) => (
          <polygon
            key={idx}
            points={points}
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            className="text-border/30"
            opacity={0.4 + idx * 0.12}
          />
        ))}

        {/* Axis lines */}
        {axisLines.map((line, idx) => (
          <line
            key={idx}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke="currentColor"
            strokeWidth="1"
            className="text-border/35"
          />
        ))}

        {/* Value polygon */}
        <motion.polygon
          initial={reduceMotion ? false : { opacity: 0, scale: 0.8 }}
          animate={{ opacity: hasMetrics ? 1 : 0.3, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          points={valuePolygon}
          fill="url(#hauntedGradient)"
          stroke="rgb(59, 130, 246)"
          strokeWidth="2"
          filter="url(#glow)"
          style={{ transformOrigin: '50% 50%' }}
          className={hasMetrics ? "cursor-pointer" : ""}
          onMouseMove={hasMetrics ? (e) => handleMouseMove(e, "polygon") : undefined}
          onMouseLeave={hasMetrics ? handleMouseLeave : undefined}
        />

        {/* Value dots at vertices */}
        {valueDots.map((dot, idx) => (
          <motion.circle
            key={dot.key}
            initial={reduceMotion ? false : { opacity: 0, r: 0 }}
            animate={{ opacity: 1, r: 5 }}
            transition={{ duration: 0.3, delay: 0.08 * idx }}
            cx={dot.x}
            cy={dot.y}
            fill="rgb(59, 130, 246)"
            stroke="rgb(30, 41, 59)"
            strokeWidth="2"
            className="cursor-pointer"
            onMouseMove={(e) => handleMouseMove(e, dot.key)}
            onMouseLeave={handleMouseLeave}
          />
        ))}

        {/* Axis labels - readable size, muted color */}
        {labelPositions.map((lp) => (
          <text
            key={lp.key}
            x={lp.x}
            y={lp.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-muted-foreground/70"
            style={{ fontSize: '11px', fontWeight: 500 }}
          >
            {lp.label}
          </text>
        ))}
      </svg>

      {/* Tooltip */}
      {hovered && hovered !== "polygon" && (
        <div
          className="absolute z-50 px-2 py-1 text-xs rounded-lg bg-card border border-border shadow-lg pointer-events-none"
          style={{
            left: mousePos.x + 10,
            top: mousePos.y - 30,
          }}
        >
          <span className="text-muted-foreground">
            {axes.find((a) => a.key === hovered)?.label}:{" "}
          </span>
          <span className="font-semibold text-foreground">
            {metrics?.[hovered] ?? "—"}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * HauntedScoreCard Component
 * Displays a score card with diamond radar chart in HAUNTED dark/glass style
 * Layout: TWO-COLUMN grid on ≥1280px (xl:), stacked on smaller screens
 * - Left column: 300px fixed width for logo (64px) + score
 * - Right column: Centered diamond radar chart (~1.4x larger for hero effect)
 */
export default function HauntedScoreCard({
  trades,
  accountId = "all",
  reduceMotion = false,
}) {
  // Calculate score and metrics from filtered trades
  const { score, metrics } = useMemo(() => {
    return computeHauntedScore(trades, accountId);
  }, [trades, accountId]);

  const hasData = score !== null;

  // Get score color based on value
  const getScoreColor = () => {
    if (!hasData) return "text-muted-foreground/40";
    if (score >= 70) return "text-emerald-500";
    if (score >= 40) return "text-amber-500";
    return "text-rose-500";
  };

  return (
    <motion.div {...fadeUp(reduceMotion, 0.10)} className="relative z-0 w-full h-full">
      <Card className="rounded-xl border border-border/40 bg-gradient-to-br from-card/95 to-card/70 backdrop-blur-md overflow-hidden h-full">
        {/* Subtle glow effects - Haunted premium style */}
        <div className="absolute -top-16 -right-16 w-32 h-32 rounded-full bg-gradient-to-br from-[#3B82F6]/8 to-[#22D3EE]/5 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-24 h-24 rounded-full bg-gradient-to-tr from-[#22D3EE]/6 to-transparent blur-2xl pointer-events-none" />

        <CardContent className="p-0 relative h-full min-h-[320px] sm:min-h-[380px]">
          {/* TWO-COLUMN Layout: Left = fixed width for logo+score, Right = flexible for radar
              Responsive: ≥1280px side-by-side, ≤1024px stack vertically */}
          <div className="flex flex-col xl:grid xl:grid-cols-[260px_1fr] h-full">
            
            {/* LEFT COLUMN: Logo at top-left, Score at bottom-left - fixed width */}
            <div className="flex flex-col items-start justify-between p-4 sm:p-6 order-last xl:order-first h-auto xl:h-full min-h-[120px] xl:min-h-0">
              {/* Haunted Logo - TOP-LEFT, 64px, rounded, proper padding from edges */}
              <div 
                className="h-16 w-16 rounded-xl overflow-hidden bg-gradient-to-br from-[#3B82F6]/25 to-[#22D3EE]/25 p-0.5 ring-1 ring-white/10 shrink-0"
                style={{
                  boxShadow: '0 0 20px rgba(59, 130, 246, 0.15), 0 4px 12px rgba(0, 0, 0, 0.2)'
                }}
              >
                <img
                  src={hauntedLogo}
                  alt="HAUNTED"
                  className="h-full w-full object-cover rounded-lg"
                  draggable={false}
                />
              </div>
              
              {/* Big Score Number with /100 - BOTTOM-LEFT, no extra labels */}
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="flex items-baseline gap-1 mt-4 xl:mt-0"
              >
                <span className={`text-5xl sm:text-6xl xl:text-7xl font-bold tracking-tight leading-none ${getScoreColor()}`}>
                  {hasData ? score : "—"}
                </span>
                <span className="text-lg xl:text-xl text-muted-foreground/60 font-medium">
                  / 100
                </span>
              </motion.div>
            </div>

            {/* RIGHT COLUMN: Diamond Radar - centered, HERO element ~1.4x larger */}
            <div className="flex items-center justify-center w-full h-full min-h-[280px] sm:min-h-[340px] xl:min-h-[380px] p-2 xl:p-4">
              <div 
                className="flex items-center justify-center w-full h-full"
                style={{ 
                  maxWidth: 'min(100%, 520px)',
                  maxHeight: 'min(100%, 520px)',
                  aspectRatio: '1 / 1'
                }}
              >
                <DiamondRadar 
                  metrics={metrics} 
                  reduceMotion={reduceMotion}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
