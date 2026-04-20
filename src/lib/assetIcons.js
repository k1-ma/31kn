/** Asset emoji icons for known trading pairs/instruments */
export const ASSET_ICONS = {
  EURUSD: "💶",
  GBPUSD: "💷",
  GER40: "📈",
  XAUUSD: "🪙",
  BTCUSD: "₿",
  ETHUSD: "⟠",
  USDJPY: "💴",
  USDCHF: "🏦",
  AUDUSD: "🦘",
  NZDUSD: "🥝",
  USDCAD: "🍁",
  US30: "🇺🇸",
  NAS100: "💻",
  SPX500: "📊",
  XAGUSD: "🥈",
  USOIL: "🛢️",
};

/** Get the icon for an asset code, with fallback */
export function getAssetIcon(code) {
  return ASSET_ICONS[code] || "📊";
}
