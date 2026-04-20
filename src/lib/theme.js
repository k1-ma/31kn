// Theme palettes + runtime CSS variable application.
// We store colors as HEX strings in state, and apply them as RGB triplets to CSS variables.

// Color categories for organized UI display
export const COLOR_CATEGORIES = {
  base: ["bg", "fg", "card", "muted", "border", "mutedFg", "ring"],
  accents: ["accent", "accent2"],
  semantic: ["success", "danger", "warning"],
  onColors: ["onAccent", "onAccent2", "onSuccess", "onDanger", "onWarning"],
  charts: ["chart1", "chart2", "chart3", "chart4"],
};

export const COLOR_KEYS = [
  // base
  "bg",
  "fg",
  "card",
  "muted",
  "border",
  "mutedFg",
  "ring",
  // accents
  "accent",
  "accent2",
  // semantic
  "success",
  "danger",
  "warning",
  // on-colors (text/icons that sit on top of the corresponding background)
  "onAccent",
  "onAccent2",
  "onSuccess",
  "onDanger",
  "onWarning",
  // chart colors
  "chart1",
  "chart2",
  "chart3",
  "chart4",
];

export const DEFAULT_PRESET_ID = "blue-steel";

// NOTE: colors are HEX strings. We store two palettes: light + dark.
// IMPORTANT: preset names are generic (no brand names).
// All presets include: base colors, accents, semantic, on-colors, chart colors
export const THEME_PRESETS = [
  {
    id: "blue-steel",
    name: { en: "Blue Steel", ru: "Синяя сталь", uk: "Синя сталь" },
    kind: "pro",
    light: {
      bg: "#F6F8FB",
      fg: "#0B1220",
      card: "#FFFFFF",
      muted: "#EEF2F7",
      border: "#D6DEEA",
      mutedFg: "#667085",
      ring: "#2962FF",
      accent: "#2962FF",
      accent2: "#00B8D9",
      success: "#16A34A",
      danger: "#EF4444",
      warning: "#F59E0B",
      onAccent: "#FFFFFF",
      onAccent2: "#FFFFFF",
      onSuccess: "#FFFFFF",
      onDanger: "#FFFFFF",
      onWarning: "#0B1220",
      chart1: "#2962FF",
      chart2: "#16A34A",
      chart3: "#EF4444",
      chart4: "#F59E0B",
    },
    dark: {
      bg: "#0B0E11",
      fg: "#D7DBE6",
      card: "#131722",
      muted: "#1E222D",
      border: "#2A2E39",
      mutedFg: "#8A92A6",
      ring: "#2962FF",
      accent: "#2962FF",
      accent2: "#00B8D9",
      success: "#22C55E",
      danger: "#FB7185",
      warning: "#FBBF24",
      onAccent: "#FFFFFF",
      onAccent2: "#0B0E11",
      onSuccess: "#0B0E11",
      onDanger: "#0B0E11",
      onWarning: "#0B0E11",
      chart1: "#5A8FFF",
      chart2: "#22C55E",
      chart3: "#FB7185",
      chart4: "#FBBF24",
    },
  },
  {
    id: "aqua-mint",
    name: { en: "Aqua Mint", ru: "Аква мята", uk: "Аква мʼята" },
    kind: "pro",
    light: {
      bg: "#F7FAFF",
      fg: "#06101D",
      card: "#FFFFFF",
      muted: "#EEF6FF",
      border: "#D8E7FF",
      mutedFg: "#56637A",
      ring: "#00BEE8",
      accent: "#00BEE8",
      accent2: "#00E5A8",
      success: "#00B981",
      danger: "#FF4D6D",
      warning: "#F59E0B",
      onAccent: "#FFFFFF",
      onAccent2: "#06101D",
      onSuccess: "#FFFFFF",
      onDanger: "#FFFFFF",
      onWarning: "#06101D",
      chart1: "#00BEE8",
      chart2: "#00B981",
      chart3: "#FF4D6D",
      chart4: "#F59E0B",
    },
    dark: {
      bg: "#090B10",
      fg: "#DDE3EE",
      card: "#0F131A",
      muted: "#171C25",
      border: "#242B39",
      mutedFg: "#8D97AA",
      ring: "#00BEE8",
      accent: "#00BEE8",
      accent2: "#00E5A8",
      success: "#00C58A",
      danger: "#FF4D6D",
      warning: "#FBBF24",
      onAccent: "#090B10",
      onAccent2: "#090B10",
      onSuccess: "#090B10",
      onDanger: "#090B10",
      onWarning: "#090B10",
      chart1: "#00D4FF",
      chart2: "#00C58A",
      chart3: "#FF6B8A",
      chart4: "#FBBF24",
    },
  },
  {
    id: "graphite-warm",
    name: { en: "Warm Graphite", ru: "Тёплый графит", uk: "Теплий графіт" },
    kind: "pro",
    light: {
      bg: "#FBFAF8",
      fg: "#141516",
      card: "#FFFFFF",
      muted: "#F3F1ED",
      border: "#E6E2DA",
      mutedFg: "#6B675E",
      ring: "#0F172A",
      accent: "#0F172A",
      accent2: "#B45309",
      success: "#16A34A",
      danger: "#DC2626",
      warning: "#F59E0B",
      onAccent: "#FFFFFF",
      onAccent2: "#FFFFFF",
      onSuccess: "#FFFFFF",
      onDanger: "#FFFFFF",
      onWarning: "#141516",
      chart1: "#0F172A",
      chart2: "#16A34A",
      chart3: "#DC2626",
      chart4: "#B45309",
    },
    dark: {
      bg: "#0B0E11",
      fg: "#E7E5E4",
      card: "#12151B",
      muted: "#1A1F27",
      border: "#2B3240",
      mutedFg: "#A8A29E",
      ring: "#E7E5E4",
      accent: "#E7E5E4",
      accent2: "#FB923C",
      success: "#22C55E",
      danger: "#FB7185",
      warning: "#FBBF24",
      onAccent: "#0B0E11",
      onAccent2: "#0B0E11",
      onSuccess: "#0B0E11",
      onDanger: "#0B0E11",
      onWarning: "#0B0E11",
      chart1: "#E7E5E4",
      chart2: "#22C55E",
      chart3: "#FB7185",
      chart4: "#FB923C",
    },
  },
  {
    id: "neon-night",
    name: { en: "Neon Night", ru: "Неон ночь", uk: "Неон ніч" },
    kind: "fun",
    light: {
      bg: "#FFFFFF",
      fg: "#0A0A0B",
      card: "#FFFFFF",
      muted: "#F2F4F8",
      border: "#E6E9EF",
      mutedFg: "#5B667A",
      ring: "#7C3AED",
      accent: "#7C3AED",
      accent2: "#10B981",
      success: "#10B981",
      danger: "#F43F5E",
      warning: "#F59E0B",
      onAccent: "#FFFFFF",
      onAccent2: "#FFFFFF",
      onSuccess: "#FFFFFF",
      onDanger: "#FFFFFF",
      onWarning: "#0A0A0B",
      chart1: "#7C3AED",
      chart2: "#10B981",
      chart3: "#F43F5E",
      chart4: "#3B82F6",
    },
    dark: {
      bg: "#05060A",
      fg: "#E8EAFF",
      card: "#0A0C14",
      muted: "#0F1220",
      border: "#1C2140",
      mutedFg: "#A2A7C8",
      ring: "#7C3AED",
      accent: "#7C3AED",
      accent2: "#10B981",
      success: "#10B981",
      danger: "#F43F5E",
      warning: "#FBBF24",
      onAccent: "#FFFFFF",
      onAccent2: "#05060A",
      onSuccess: "#05060A",
      onDanger: "#FFFFFF",
      onWarning: "#05060A",
      chart1: "#A78BFA",
      chart2: "#34D399",
      chart3: "#FB7185",
      chart4: "#60A5FA",
    },
  },
  {
    id: "mono-minimal",
    name: { en: "Mono Minimal", ru: "Моно минимал", uk: "Моно мінімал" },
    kind: "clean",
    light: {
      bg: "#FAFAFA",
      fg: "#0B0E11",
      card: "#FFFFFF",
      muted: "#F1F3F5",
      border: "#E5E7EB",
      mutedFg: "#6B7280",
      ring: "#111827",
      accent: "#111827",
      accent2: "#6B7280",
      success: "#16A34A",
      danger: "#DC2626",
      warning: "#F59E0B",
      onAccent: "#FFFFFF",
      onAccent2: "#FFFFFF",
      onSuccess: "#FFFFFF",
      onDanger: "#FFFFFF",
      onWarning: "#0B0E11",
      chart1: "#111827",
      chart2: "#16A34A",
      chart3: "#DC2626",
      chart4: "#6B7280",
    },
    dark: {
      bg: "#0B0E11",
      fg: "#E5E7EB",
      card: "#111827",
      muted: "#0F172A",
      border: "#1F2937",
      mutedFg: "#9CA3AF",
      ring: "#E5E7EB",
      accent: "#E5E7EB",
      accent2: "#9CA3AF",
      success: "#22C55E",
      danger: "#F87171",
      warning: "#FBBF24",
      onAccent: "#0B0E11",
      onAccent2: "#0B0E11",
      onSuccess: "#0B0E11",
      onDanger: "#0B0E11",
      onWarning: "#0B0E11",
      chart1: "#E5E7EB",
      chart2: "#22C55E",
      chart3: "#F87171",
      chart4: "#9CA3AF",
    },
  },
  {
    id: "ocean-breeze",
    name: { en: "Ocean Breeze", ru: "Океанский бриз", uk: "Океанський бриз" },
    kind: "pro",
    light: {
      bg: "#F0F9FF",
      fg: "#0C1929",
      card: "#FFFFFF",
      muted: "#E0F2FE",
      border: "#BAE6FD",
      mutedFg: "#475569",
      ring: "#0284C7",
      accent: "#0284C7",
      accent2: "#06B6D4",
      success: "#059669",
      danger: "#E11D48",
      warning: "#D97706",
      onAccent: "#FFFFFF",
      onAccent2: "#FFFFFF",
      onSuccess: "#FFFFFF",
      onDanger: "#FFFFFF",
      onWarning: "#0C1929",
      chart1: "#0284C7",
      chart2: "#059669",
      chart3: "#E11D48",
      chart4: "#D97706",
    },
    dark: {
      bg: "#0A1628",
      fg: "#E2E8F0",
      card: "#0F2037",
      muted: "#162A47",
      border: "#1E3A5F",
      mutedFg: "#94A3B8",
      ring: "#38BDF8",
      accent: "#38BDF8",
      accent2: "#22D3EE",
      success: "#34D399",
      danger: "#FB7185",
      warning: "#FBBF24",
      onAccent: "#0A1628",
      onAccent2: "#0A1628",
      onSuccess: "#0A1628",
      onDanger: "#0A1628",
      onWarning: "#0A1628",
      chart1: "#38BDF8",
      chart2: "#34D399",
      chart3: "#FB7185",
      chart4: "#FBBF24",
    },
  },
];

export function normalizeHex(hex) {
  const s = String(hex || "").trim();
  if (!s) return "#000000";
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toUpperCase();
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s.toUpperCase()}`;
  // We keep UI strict for state, but tolerate #RGB in input by expanding.
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const r = s[1];
    const g = s[2];
    const b = s[3];
    return (`#${r}${r}${g}${g}${b}${b}`).toUpperCase();
  }
  return "#000000";
}

export function hexToRgbTuple(hex) {
  const h = normalizeHex(hex).slice(1);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [r, g, b];
}

function srgbToLin(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function relLuminance(hex) {
  const [r, g, b] = hexToRgbTuple(hex);
  const R = srgbToLin(r);
  const G = srgbToLin(g);
  const B = srgbToLin(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

export function contrastRatio(a, b) {
  const L1 = relLuminance(a);
  const L2 = relLuminance(b);
  const hi = Math.max(L1, L2);
  const lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

function bestOnColor(bgHex) {
  // Pick black/white for best contrast.
  const black = "#0B0E11";
  const white = "#FFFFFF";
  return contrastRatio(bgHex, white) >= contrastRatio(bgHex, black) ? white : black;
}

export function ensureReadable(palette) {
  const p = { ...(palette || {}) };

  // Guarantee required keys exist; missing keys should not crash apply.
  for (const k of COLOR_KEYS) {
    if (p[k] === undefined || p[k] === null || p[k] === "") continue;
    p[k] = normalizeHex(p[k]);
  }

  // If fg is unreadable on bg, force to best contrast.
  if (p.bg && p.fg && contrastRatio(p.bg, p.fg) < 4.5) {
    p.fg = bestOnColor(p.bg);
  }

  // mutedFg must still be readable.
  if (p.bg && p.mutedFg && contrastRatio(p.bg, p.mutedFg) < 3.2) {
    // Slightly lower requirement for secondary text.
    p.mutedFg = bestOnColor(p.bg) === "#FFFFFF" ? "#B7C0D1" : "#4B5563";
  }

  // On-colors: if not provided, compute.
  if (p.accent && !p.onAccent) p.onAccent = bestOnColor(p.accent);
  if (p.accent2 && !p.onAccent2) p.onAccent2 = bestOnColor(p.accent2);
  if (p.success && !p.onSuccess) p.onSuccess = bestOnColor(p.success);
  if (p.danger && !p.onDanger) p.onDanger = bestOnColor(p.danger);
  if (p.warning && !p.onWarning) p.onWarning = bestOnColor(p.warning);

  // If provided but unreadable, fix.
  const pairs = [
    ["accent", "onAccent"],
    ["accent2", "onAccent2"],
    ["success", "onSuccess"],
    ["danger", "onDanger"],
    ["warning", "onWarning"],
  ];
  for (const [bg, on] of pairs) {
    if (p[bg] && p[on] && contrastRatio(p[bg], p[on]) < 4.5) {
      p[on] = bestOnColor(p[bg]);
    }
  }

  // Chart colors: default to accent/semantic colors if not provided
  if (!p.chart1 && p.accent) p.chart1 = p.accent;
  if (!p.chart2 && p.success) p.chart2 = p.success;
  if (!p.chart3 && p.danger) p.chart3 = p.danger;
  if (!p.chart4 && p.warning) p.chart4 = p.warning;

  return p;
}

export function paletteToCssVars(palette) {
  const safe = ensureReadable(palette);
  const vars = {};
  for (const k of COLOR_KEYS) {
    const v = safe?.[k];
    if (!v) continue;
    const [r, g, b] = hexToRgbTuple(v);
    // Map camelCase keys to CSS variable names
    const cssKey =
      k === "mutedFg"
        ? "--muted-fg"
        : k === "accent2"
        ? "--accent-2"
        : k === "onAccent"
        ? "--on-accent"
        : k === "onAccent2"
        ? "--on-accent-2"
        : k === "onSuccess"
        ? "--on-success"
        : k === "onDanger"
        ? "--on-danger"
        : k === "onWarning"
        ? "--on-warning"
        : k === "chart1"
        ? "--chart-1"
        : k === "chart2"
        ? "--chart-2"
        : k === "chart3"
        ? "--chart-3"
        : k === "chart4"
        ? "--chart-4"
        : `--${k}`;
    vars[cssKey] = `${r} ${g} ${b}`;
  }
  return vars;
}

export function applyPalette(palette) {
  if (!palette) return;
  const safe = ensureReadable(palette);
  const root = document.documentElement;
  const vars = paletteToCssVars(safe);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
}

export function getPresetById(id, customPresets = []) {
  const built = THEME_PRESETS.find((p) => p.id === id);
  if (built) return built;

  const custom = (Array.isArray(customPresets) ? customPresets : []).find((p) => p?.id === id);
  if (custom) {
    const nameObj =
      typeof custom.name === "string"
        ? { en: custom.name, ru: custom.name, uk: custom.name }
        : custom.name || { en: "Custom", ru: "Пользовательский", uk: "Користувацький" };
    return {
      id: custom.id,
      name: nameObj,
      kind: "custom",
      light: custom.light || {},
      dark: custom.dark || {},
      isCustom: true,
    };
  }

  return THEME_PRESETS[0];
}

export function getDefaultPalettes() {
  const preset = getPresetById(DEFAULT_PRESET_ID);
  const light = ensureReadable(preset.light);
  const dark = ensureReadable(preset.dark);
  return { light, dark, presetId: preset.id };
}

// --- Theme Studio helpers ---

function hexToHsl(hex) {
  const [r, g, b] = hexToRgbTuple(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, s * 100, l * 100];
}

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * Math.max(0, Math.min(1, color)));
  };
  const toHex = (v) => v.toString(16).padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`.toUpperCase();
}

export function generateDarkFromLight(lightPalette) {
  if (!lightPalette || typeof lightPalette !== "object") return {};
  const p = {};
  const lp = { ...lightPalette };
  for (const k of COLOR_KEYS) if (lp[k]) lp[k] = normalizeHex(lp[k]);

  // bg: very dark
  if (lp.bg) {
    const [h, s] = hexToHsl(lp.bg);
    p.bg = hslToHex(h, Math.min(s + 5, 20), 5);
  }
  // fg: very light
  if (lp.fg) {
    const [h, s] = hexToHsl(lp.fg);
    p.fg = hslToHex(h, Math.min(s, 15), 88);
  }
  // card: slightly lighter than bg
  if (lp.card) {
    const [h, s] = hexToHsl(p.bg || "#0B0E11");
    p.card = hslToHex(h, Math.min(s + 5, 25), 10);
  }
  // muted: between bg and card
  if (lp.muted) {
    const [h, s] = hexToHsl(p.bg || "#0B0E11");
    p.muted = hslToHex(h, Math.min(s + 5, 22), 12);
  }
  // border
  if (lp.border) {
    const [h, s] = hexToHsl(p.bg || "#0B0E11");
    p.border = hslToHex(h, Math.min(s + 5, 20), 18);
  }
  // mutedFg
  if (lp.mutedFg) {
    const [h, s] = hexToHsl(lp.mutedFg);
    p.mutedFg = hslToHex(h, Math.min(s + 5, 25), 60);
  }
  // ring
  if (lp.ring) p.ring = lp.ring;
  // accents: slightly brighter
  for (const k of ["accent", "accent2"]) {
    if (lp[k]) {
      const [h, s, l] = hexToHsl(lp[k]);
      p[k] = hslToHex(h, Math.min(s + 10, 100), Math.min(l + 8, 70));
    }
  }
  // semantic: more saturated
  for (const k of ["success", "danger", "warning"]) {
    if (lp[k]) {
      const [h, s, l] = hexToHsl(lp[k]);
      p[k] = hslToHex(h, Math.min(s + 15, 100), Math.min(l + 5, 65));
    }
  }
  // on-colors: auto
  const onColorToBase = {
    onAccent: "accent", onAccent2: "accent2",
    onSuccess: "success", onDanger: "danger", onWarning: "warning",
  };
  for (const [k, bgKey] of Object.entries(onColorToBase)) {
    if (p[bgKey]) p[k] = bestOnColor(p[bgKey]);
  }
  // chart colors: slightly brighter
  for (const k of ["chart1", "chart2", "chart3", "chart4"]) {
    if (lp[k]) {
      const [h, s, l] = hexToHsl(lp[k]);
      p[k] = hslToHex(h, Math.min(s + 10, 100), Math.min(l + 10, 70));
    }
  }
  return ensureReadable(p);
}

export function validatePalette(palette) {
  const errors = [];
  if (!palette || typeof palette !== "object") {
    errors.push({ key: "_root", message: "Palette must be an object" });
    return errors;
  }
  const hexRe = /^#[0-9a-fA-F]{6}$/;
  for (const k of COLOR_KEYS) {
    if (!palette[k]) {
      errors.push({ key: k, message: `Missing color: ${k}` });
    } else if (!hexRe.test(palette[k])) {
      errors.push({ key: k, message: `Invalid hex for ${k}: ${palette[k]}` });
    }
  }
  if (palette.bg && palette.fg && hexRe.test(palette.bg) && hexRe.test(palette.fg)) {
    const cr = contrastRatio(palette.bg, palette.fg);
    if (cr < 4.5) errors.push({ key: "fg", message: `Low contrast bg/fg: ${cr.toFixed(2)}:1` });
  }
  return errors;
}

export function exportThemeConfig(ui) {
  const data = {
    presetId: ui?.presetId || DEFAULT_PRESET_ID,
    colors: ui?.colors || {},
    colorsDark: ui?.colorsDark || {},
    designStyle: ui?.designStyle || "glass",
  };
  return JSON.stringify(data, null, 2);
}

export function importThemeConfig(jsonString) {
  let data;
  try { data = JSON.parse(jsonString); } catch { throw new Error("Invalid JSON"); }
  if (!data || typeof data !== "object") throw new Error("Invalid format");
  const hexRe = /^#[0-9a-fA-F]{6}$/;
  if (data.colors && typeof data.colors === "object") {
    for (const [k, v] of Object.entries(data.colors)) {
      if (!hexRe.test(v)) throw new Error(`Invalid hex in colors.${k}: ${v}`);
    }
  }
  if (data.colorsDark && typeof data.colorsDark === "object") {
    for (const [k, v] of Object.entries(data.colorsDark)) {
      if (!hexRe.test(v)) throw new Error(`Invalid hex in colorsDark.${k}: ${v}`);
    }
  }
  return {
    presetId: data.presetId || DEFAULT_PRESET_ID,
    colors: data.colors || {},
    colorsDark: data.colorsDark || {},
    designStyle: data.designStyle || "glass",
  };
}

export function mergePresets(themejsPresets, themePresetsJsPresets) {
  const merged = [...(themejsPresets || [])];
  for (const tp of themePresetsJsPresets || []) {
    if (merged.some((m) => m.id === tp.id)) continue;
    // Convert dash-key format to camelCase for compatibility
    const convert = (obj) => {
      if (!obj) return {};
      const out = {};
      for (const [k, v] of Object.entries(obj)) {
        const ck = k.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
        out[ck] = v;
      }
      return out;
    };
    const designToKind = { strict: "pro", neo: "fun" };
    merged.push({
      id: tp.id,
      name: typeof tp.name === "string"
        ? { en: tp.name, ru: tp.name, uk: tp.name }
        : tp.name || { en: tp.id, ru: tp.id, uk: tp.id },
      kind: designToKind[tp.design] || "clean",
      light: convert(tp.light),
      dark: convert(tp.dark),
      design: tp.design,
    });
  }
  return merged;
}
