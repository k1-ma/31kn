import React, { useState, useRef, useEffect, useCallback } from "react";

const QUICK_COLORS = [
  "#EF4444", "#F97316", "#F59E0B", "#22C55E",
  "#10B981", "#06B6D4", "#3B82F6", "#6366F1",
  "#8B5CF6", "#A855F7", "#EC4899", "#F43F5E",
  "#0F172A", "#475569", "#9CA3AF", "#FFFFFF",
];

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function hsvToHex(h, s, v) {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 1);
  v = clamp(v, 0, 1);
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toH = (n) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return `#${toH(r)}${toH(g)}${toH(b)}`.toUpperCase();
}

function hexToHsv(hex) {
  const h = String(hex || "").replace(/^#/, "");
  if (h.length !== 6) return [0, 0, 0];
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let hue = 0;
  if (d !== 0) {
    if (max === r) hue = 60 * (((g - b) / d) % 6);
    else if (max === g) hue = 60 * ((b - r) / d + 2);
    else hue = 60 * ((r - g) / d + 4);
  }
  if (hue < 0) hue += 360;
  const sat = max === 0 ? 0 : d / max;
  return [hue, sat, max];
}

export default function ColorPicker({ value = "#000000", onChange, className = "" }) {
  const [open, setOpen] = useState(false);
  const [hexInput, setHexInput] = useState(value);
  const ref = useRef(null);
  const areaRef = useRef(null);
  const hueRef = useRef(null);
  const draggingArea = useRef(false);
  const draggingHue = useRef(false);

  const [hsv, setHsv] = useState(() => hexToHsv(value));

  useEffect(() => { setHexInput(value); setHsv(hexToHsv(value)); }, [value]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const commitHsv = useCallback((h, s, v) => {
    const hex = hsvToHex(h, s, v);
    setHsv([h, s, v]);
    setHexInput(hex);
    onChange?.(hex);
  }, [onChange]);

  const handleAreaPointer = useCallback((e) => {
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect) return;
    const s = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const v = clamp(1 - (e.clientY - rect.top) / rect.height, 0, 1);
    commitHsv(hsv[0], s, v);
  }, [hsv, commitHsv]);

  const handleHuePointer = useCallback((e) => {
    const rect = hueRef.current?.getBoundingClientRect();
    if (!rect) return;
    const h = clamp((e.clientX - rect.left) / rect.width, 0, 1) * 360;
    commitHsv(h, hsv[1], hsv[2]);
  }, [hsv, commitHsv]);

  useEffect(() => {
    const onMove = (e) => {
      if (draggingArea.current) handleAreaPointer(e);
      if (draggingHue.current) handleHuePointer(e);
    };
    const onUp = () => { draggingArea.current = false; draggingHue.current = false; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [handleAreaPointer, handleHuePointer]);

  const handleHexInput = (e) => {
    let v = e.target.value;
    setHexInput(v);
    if (!v.startsWith("#")) v = "#" + v;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
      setHsv(hexToHsv(v));
      onChange?.(v.toUpperCase());
    }
  };

  const tryEyeDropper = async () => {
    if (!window.EyeDropper) return;
    try {
      const dropper = new window.EyeDropper();
      const result = await dropper.open();
      if (result?.sRGBHex) {
        const hex = result.sRGBHex.toUpperCase();
        setHsv(hexToHsv(hex));
        setHexInput(hex);
        onChange?.(hex);
      }
    } catch { /* cancelled */ }
  };

  return (
    <div ref={ref} className={"relative inline-block " + className}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="h-7 w-7 rounded-full border-2 border-border/50 shadow-sm cursor-pointer transition-all hover:scale-110 focus-visible:ring-2 focus-visible:ring-accent/40"
        style={{ backgroundColor: value }}
        aria-label="Pick color"
      />
      {open && (
        <div className="absolute z-50 mt-2 left-0 w-56 rounded-xl border border-border/50 bg-card shadow-xl p-3 space-y-2">
          {/* Saturation/Value area */}
          <div
            ref={areaRef}
            className="relative h-32 w-full rounded-lg cursor-crosshair overflow-hidden"
            style={{ background: `hsl(${hsv[0]}, 100%, 50%)` }}
            onPointerDown={(e) => { draggingArea.current = true; handleAreaPointer(e); }}
          >
            <div className="absolute inset-0" style={{ background: "linear-gradient(to right, #fff, transparent)" }} />
            <div className="absolute inset-0" style={{ background: "linear-gradient(to top, #000, transparent)" }} />
            <div
              className="absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow-md pointer-events-none"
              style={{
                left: `${hsv[1] * 100}%`,
                top: `${(1 - hsv[2]) * 100}%`,
                transform: "translate(-50%, -50%)",
                backgroundColor: value,
              }}
            />
          </div>
          {/* Hue slider */}
          <div
            ref={hueRef}
            className="relative h-3 w-full rounded-full cursor-pointer"
            style={{ background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" }}
            onPointerDown={(e) => { draggingHue.current = true; handleHuePointer(e); }}
          >
            <div
              className="absolute top-1/2 w-3.5 h-3.5 rounded-full border-2 border-white shadow-md pointer-events-none"
              style={{
                left: `${(hsv[0] / 360) * 100}%`,
                transform: "translate(-50%, -50%)",
                backgroundColor: `hsl(${hsv[0]}, 100%, 50%)`,
              }}
            />
          </div>
          {/* Quick palette */}
          <div className="grid grid-cols-8 gap-1">
            {QUICK_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className="h-5 w-5 rounded-full border border-border/30 cursor-pointer hover:scale-125 transition-transform"
                style={{ backgroundColor: c }}
                onClick={() => { setHsv(hexToHsv(c)); setHexInput(c); onChange?.(c); }}
              />
            ))}
          </div>
          {/* HEX input + eyedropper */}
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={hexInput}
              onChange={handleHexInput}
              className="flex-1 h-7 rounded-lg border border-border/50 bg-muted/30 px-2 text-[12px] font-mono text-foreground outline-none focus:border-accent/50"
              maxLength={7}
              spellCheck={false}
            />
            {typeof window !== "undefined" && window.EyeDropper && (
              <button
                type="button"
                onClick={tryEyeDropper}
                className="h-7 w-7 rounded-lg border border-border/50 bg-muted/30 flex items-center justify-center text-xs hover:bg-muted/60 transition-colors"
                title="Eyedropper"
                aria-label="Pick color from screen"
              >
                💉
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
