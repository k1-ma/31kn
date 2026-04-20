import React, { useMemo } from "react";

/**
 * Simple SVG-based sparkline chart
 * @param {Object} props
 * @param {number[]} props.data - Array of numeric values
 * @param {number} props.width - Width in pixels
 * @param {number} props.height - Height in pixels
 * @param {string} props.color - Stroke color (default: accent color)
 * @param {string} props.fillColor - Fill color for area under curve
 * @param {boolean} props.showDots - Show dots at data points
 * @param {boolean} props.showArea - Fill area under the line
 * @param {string} props.className - Additional CSS classes
 */
export default function Sparkline({
  data = [],
  width = 100,
  height = 32,
  color,
  fillColor,
  showDots = false,
  showArea = true,
  className = "",
}) {
  const { path, areaPath, points, min, max, lastValue, trend } = useMemo(() => {
    if (!data || data.length < 2) {
      return { path: "", areaPath: "", points: [], min: 0, max: 0, lastValue: 0, trend: "neutral" };
    }

    const values = data.map(v => (typeof v === "number" && isFinite(v) ? v : 0));
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 1;
    
    // Padding for top/bottom
    const padding = 4;
    const chartHeight = height - padding * 2;
    const chartWidth = width - 4;
    
    // Scale value to y coordinate (inverted because SVG y=0 is top)
    const scaleY = (v) => padding + chartHeight - ((v - minVal) / range) * chartHeight;
    const scaleX = (i) => 2 + (i / (values.length - 1)) * chartWidth;
    
    // Build path
    const pts = values.map((v, i) => ({ x: scaleX(i), y: scaleY(v), value: v }));
    
    // Smooth curve using quadratic bezier
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const cpX = (prev.x + curr.x) / 2;
      d += ` Q ${prev.x + (curr.x - prev.x) / 4} ${prev.y}, ${cpX} ${(prev.y + curr.y) / 2}`;
      if (i === pts.length - 1) {
        d += ` Q ${curr.x - (curr.x - prev.x) / 4} ${curr.y}, ${curr.x} ${curr.y}`;
      }
    }
    
    // Area path (closed)
    const areaD = d + ` L ${pts[pts.length - 1].x} ${height - padding} L ${pts[0].x} ${height - padding} Z`;
    
    // Determine trend
    const firstVal = values[0];
    const lastVal = values[values.length - 1];
    const trendDir = lastVal > firstVal ? "up" : lastVal < firstVal ? "down" : "neutral";
    
    return {
      path: d,
      areaPath: areaD,
      points: pts,
      min: minVal,
      max: maxVal,
      lastValue: lastVal,
      trend: trendDir,
    };
  }, [data, width, height]);

  if (!data || data.length < 2) {
    return (
      <svg width={width} height={height} className={className}>
        <line 
          x1="2" 
          y1={height / 2} 
          x2={width - 2} 
          y2={height / 2} 
          stroke="rgb(var(--muted-foreground))" 
          strokeWidth="1" 
          strokeDasharray="2,2"
          opacity="0.3"
        />
      </svg>
    );
  }

  // Default colors based on trend
  const strokeColor = color || (trend === "up" 
    ? "rgb(var(--success, 34 197 94))" 
    : trend === "down" 
    ? "rgb(var(--destructive, 239 68 68))" 
    : "rgb(var(--accent))");
  
  const fill = fillColor || (trend === "up" 
    ? "rgba(34, 197, 94, 0.15)" 
    : trend === "down" 
    ? "rgba(239, 68, 68, 0.15)" 
    : "rgba(99, 102, 241, 0.15)");

  return (
    <svg 
      width={width} 
      height={height} 
      className={className}
      style={{ display: "block" }}
    >
      {/* Gradient definitions */}
      <defs>
        <linearGradient id={`sparkline-gradient-${trend}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
        </linearGradient>
      </defs>
      
      {/* Area fill */}
      {showArea && (
        <path
          d={areaPath}
          fill={`url(#sparkline-gradient-${trend})`}
        />
      )}
      
      {/* Line */}
      <path
        d={path}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      
      {/* Dots */}
      {showDots && points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={i === points.length - 1 ? 3 : 2}
          fill={i === points.length - 1 ? strokeColor : "rgb(var(--card))"}
          stroke={strokeColor}
          strokeWidth="1"
        />
      ))}
      
      {/* Last point dot (always shown) */}
      {!showDots && points.length > 0 && (
        <circle
          cx={points[points.length - 1].x}
          cy={points[points.length - 1].y}
          r="2.5"
          fill={strokeColor}
        />
      )}
    </svg>
  );
}

/**
 * Calculate equity curve from trades
 * @param {Array} trades - Array of trade objects with pnl and date
 * @param {number} startingEquity - Starting balance
 * @returns {number[]} - Array of equity values
 */
export function calculateEquityCurve(trades, startingEquity = 0) {
  if (!trades || trades.length === 0) return [startingEquity];
  
  // Sort trades by date
  const sorted = [...trades].sort((a, b) => {
    const da = a.date || a.createdAt || 0;
    const db = b.date || b.createdAt || 0;
    return String(da).localeCompare(String(db));
  });
  
  // Build equity curve
  const curve = [startingEquity];
  let equity = startingEquity;
  
  for (const trade of sorted) {
    const pnl = typeof trade.pnl === "number" ? trade.pnl : 0;
    equity += pnl;
    curve.push(equity);
  }
  
  return curve;
}

/**
 * Get recent equity snapshots (last N data points)
 * @param {number[]} curve - Full equity curve
 * @param {number} count - Number of points to return
 * @returns {number[]}
 */
export function getRecentEquity(curve, count = 20) {
  if (!curve || curve.length === 0) return [];
  if (curve.length <= count) return curve;
  return curve.slice(-count);
}
