// Theme + design presets.
//
// Stored in db.ui.themeConfig:
// {
//   presetId: string,
//   custom?: { light?: Record<string,string>, dark?: Record<string,string> } // hex
// }
//
// CSS variables are stored as RGB triplets ("r g b") because Tailwind is wired to:
// rgb(var(--token) / <alpha-value>)

export const THEME_VAR_KEYS = [
  "bg",
  "fg",
  "card",
  "muted",
  "border",
  "muted-fg",
  "ring",
  "accent",
  "accent-2",
  "success",
  "danger",
  "warning",
  "on-accent",
  "on-accent-2",
  "on-success",
  "on-danger",
  "on-warning",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
];

const hexToRgbTriplet = (hex) => {
  const h = String(hex || "").trim().replace(/^#/, "");
  if (![3, 6].includes(h.length)) return null;
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return null;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `${r} ${g} ${b}`;
};

const pick = (obj, keys) => {
  const out = {};
  for (const k of keys) {
    if (obj && typeof obj[k] === "string" && obj[k]) out[k] = obj[k];
  }
  return out;
};

export const THEME_PRESETS = [
  {
    id: "strict-graphite",
    name: "Strict Graphite",
    design: "strict",
    light: {
      "bg": "#F7F7F8",
      "fg": "#0B1220",
      "card": "#FFFFFF",
      "muted": "#F0F1F3",
      "border": "#DADCE3",
      "muted-fg": "#5C6472",
      "ring": "#2D6BFF",
      "accent": "#2D6BFF",
      "accent-2": "#00B8D9",
      "success": "#0A8F5A",
      "danger": "#C5322E",
      "warning": "#B46B00",
      "on-accent": "#FFFFFF",
      "on-accent-2": "#FFFFFF",
      "on-success": "#FFFFFF",
      "on-danger": "#FFFFFF",
      "on-warning": "#0B1220",
      "chart-1": "#2D6BFF",
      "chart-2": "#0A8F5A",
      "chart-3": "#C5322E",
      "chart-4": "#B46B00",
    },
    dark: {
      "bg": "#0B0F16",
      "fg": "#E8ECF4",
      "card": "#111827",
      "muted": "#0F172A",
      "border": "#243244",
      "muted-fg": "#A3AEC2",
      "ring": "#7AA6FF",
      "accent": "#7AA6FF",
      "accent-2": "#00D4FF",
      "success": "#38D39F",
      "danger": "#FF6B63",
      "warning": "#FFC266",
      "on-accent": "#0B0F16",
      "on-accent-2": "#0B0F16",
      "on-success": "#0B0F16",
      "on-danger": "#0B0F16",
      "on-warning": "#0B0F16",
      "chart-1": "#7AA6FF",
      "chart-2": "#38D39F",
      "chart-3": "#FF6B63",
      "chart-4": "#FFC266",
    },
  },
  {
    id: "glass-indigo",
    name: "Glass Indigo",
    design: "glass",
    light: {
      "bg": "#F8FAFC",
      "fg": "#0F172A",
      "card": "#FFFFFF",
      "muted": "#F1F5F9",
      "border": "#E2E8F0",
      "muted-fg": "#64748B",
      "ring": "#6366F1",
      "accent": "#6366F1",
      "accent-2": "#06B6D4",
      "success": "#22C55E",
      "danger": "#F43F5E",
      "warning": "#F59E0B",
      "on-accent": "#FFFFFF",
      "on-accent-2": "#FFFFFF",
      "on-success": "#FFFFFF",
      "on-danger": "#FFFFFF",
      "on-warning": "#0F172A",
      "chart-1": "#22C55E",
      "chart-2": "#3B82F6",
      "chart-3": "#F43F5E",
      "chart-4": "#F59E0B",
    },
    dark: {
      "bg": "#030617",
      "fg": "#E2E8F0",
      "card": "#0A1228",
      "muted": "#0F172A",
      "border": "#1E293B",
      "muted-fg": "#94A3B8",
      "ring": "#818CF8",
      "accent": "#818CF8",
      "accent-2": "#22D3EE",
      "success": "#22C55E",
      "danger": "#FB7185",
      "warning": "#FBBF24",
      "on-accent": "#030617",
      "on-accent-2": "#030617",
      "on-success": "#030617",
      "on-danger": "#030617",
      "on-warning": "#030617",
      "chart-1": "#22C55E",
      "chart-2": "#60A5FA",
      "chart-3": "#FB7185",
      "chart-4": "#FBBF24",
    },
  },
  {
    id: "strict-sand",
    name: "Strict Sand",
    design: "strict",
    light: {
      "bg": "#FBF8F2",
      "fg": "#1A1A1A",
      "card": "#FFFFFF",
      "muted": "#F2EEE6",
      "border": "#E1D7C6",
      "muted-fg": "#6B655A",
      "ring": "#2B6F6D",
      "accent": "#2B6F6D",
      "accent-2": "#B45309",
      "success": "#1D7A52",
      "danger": "#B7352D",
      "warning": "#B16C00",
      "on-accent": "#FFFFFF",
      "on-accent-2": "#FFFFFF",
      "on-success": "#FFFFFF",
      "on-danger": "#FFFFFF",
      "on-warning": "#1A1A1A",
      "chart-1": "#2B6F6D",
      "chart-2": "#1D7A52",
      "chart-3": "#B7352D",
      "chart-4": "#B16C00",
    },
    dark: {
      "bg": "#0E0D0A",
      "fg": "#F0EDE6",
      "card": "#171510",
      "muted": "#12100C",
      "border": "#2A241A",
      "muted-fg": "#B9B2A7",
      "ring": "#79C9C3",
      "accent": "#79C9C3",
      "accent-2": "#FB923C",
      "success": "#43D6A1",
      "danger": "#FF6E66",
      "warning": "#FFC46B",
      "on-accent": "#0E0D0A",
      "on-accent-2": "#0E0D0A",
      "on-success": "#0E0D0A",
      "on-danger": "#0E0D0A",
      "on-warning": "#0E0D0A",
      "chart-1": "#79C9C3",
      "chart-2": "#43D6A1",
      "chart-3": "#FF6E66",
      "chart-4": "#FFC46B",
    },
  },
  {
    id: "neo-violet",
    name: "Neo Violet",
    design: "neo",
    light: {
      "bg": "#F9FAFF",
      "fg": "#111827",
      "card": "#FFFFFF",
      "muted": "#EEF2FF",
      "border": "#E0E7FF",
      "muted-fg": "#6B7280",
      "ring": "#7C3AED",
      "accent": "#7C3AED",
      "accent-2": "#10B981",
      "success": "#22C55E",
      "danger": "#F43F5E",
      "warning": "#F59E0B",
      "on-accent": "#FFFFFF",
      "on-accent-2": "#FFFFFF",
      "on-success": "#FFFFFF",
      "on-danger": "#FFFFFF",
      "on-warning": "#111827",
      "chart-1": "#7C3AED",
      "chart-2": "#3B82F6",
      "chart-3": "#22C55E",
      "chart-4": "#F43F5E",
    },
    dark: {
      "bg": "#050613",
      "fg": "#E5E7EB",
      "card": "#0B0C1F",
      "muted": "#111231",
      "border": "#2B2D66",
      "muted-fg": "#A1A1AA",
      "ring": "#A78BFA",
      "accent": "#A78BFA",
      "accent-2": "#34D399",
      "success": "#34D399",
      "danger": "#FB7185",
      "warning": "#FBBF24",
      "on-accent": "#050613",
      "on-accent-2": "#050613",
      "on-success": "#050613",
      "on-danger": "#050613",
      "on-warning": "#050613",
      "chart-1": "#A78BFA",
      "chart-2": "#60A5FA",
      "chart-3": "#34D399",
      "chart-4": "#FB7185",
    },
  },
];

export const getPresetById = (id) => THEME_PRESETS.find((p) => p.id === id) || THEME_PRESETS[0];

export const resolveThemeVars = ({ mode, themeConfig }) => {
  const preset = getPresetById(themeConfig?.presetId);
  const baseHex = (mode === "dark" ? preset.dark : preset.light) || {};
  const customHex = pick(themeConfig?.custom?.[mode], THEME_VAR_KEYS);
  const merged = { ...baseHex, ...customHex };

  const rgbVars = {};
  for (const k of THEME_VAR_KEYS) {
    const trip = hexToRgbTriplet(merged[k]);
    if (trip) rgbVars[`--${k}`] = trip;
  }
  return { rgbVars, design: preset.design };
};

export const applyThemeConfig = ({ mode, themeConfig }) => {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  const { rgbVars, design } = resolveThemeVars({ mode, themeConfig });

  // design preset
  root.dataset.design = design || "glass";

  // variables
  for (const [k, v] of Object.entries(rgbVars)) {
    root.style.setProperty(k, v);
  }
};

export const DESIGN_STYLES = [
  {
    id: "glass",
    icon: "✨",
    name: { en: "Glass", ru: "Стекло", uk: "Скло" },
    description: {
      en: "Frosted glass effect with backdrop blur and translucent cards",
      ru: "Эффект матового стекла с размытием фона и полупрозрачными карточками",
      uk: "Ефект матового скла з розмиттям фону та напівпрозорими картками",
    },
  },
  {
    id: "strict",
    icon: "📐",
    name: { en: "Strict", ru: "Строгий", uk: "Строгий" },
    description: {
      en: "Sharp borders, no blur, classic corporate look",
      ru: "Чёткие границы, без размытия, классический корпоративный вид",
      uk: "Чіткі межі, без розмиття, класичний корпоративний вигляд",
    },
  },
  {
    id: "neo",
    icon: "🔮",
    name: { en: "Neo", ru: "Нео", uk: "Нео" },
    description: {
      en: "Soft neumorphic shadows, embossed surfaces",
      ru: "Мягкие нейморфные тени, выпуклые элементы",
      uk: "М'які неоморфні тіні, випуклі елементи",
    },
  },
];
