/**
 * @file Win Rate Preferences Helper
 * 
 * Single source of truth for getting the global win rate calculation mode
 * from application state.
 * 
 * The win rate mode is a GLOBAL journal setting stored in ui.winRateMode,
 * NOT a per-account setting. This replaced the old account.metricsPrefs approach.
 * 
 * Mode options:
 * - "ignore": BE trades don't affect WR. WR = wins / (wins + losses) * 100
 * - "loss": BE trades count as losses in WR denominator. WR = wins / (wins + losses + breakEvens) * 100
 */

/**
 * Get the win rate mode from global application settings.
 * This is the single source of truth for win rate calculation mode.
 * 
 * @param {Object} appState - Application state (typically contains ui object)
 * @returns {string} - "ignore" | "loss"
 */
export function getWinRateModeFromSettings(appState) {
  // Get mode from ui settings with fallback to "ignore"
  const mode = appState?.ui?.winRateMode;
  
  // Validate mode value - only "ignore" or "loss" are valid
  if (mode === "loss") {
    return "loss";
  }
  
  // Default to "ignore" for any invalid or missing value
  return "ignore";
}

/**
 * Alias for getWinRateModeFromSettings for convenience.
 * Can be used when you only have the ui object available.
 * 
 * @param {Object} ui - UI settings object (from db.ui or appState.ui)
 * @returns {string} - "ignore" | "loss"
 */
export function getGlobalWinRateMode(ui) {
  const mode = ui?.winRateMode;
  return mode === "loss" ? "loss" : "ignore";
}

/**
 * Get the average RR mode from global application settings.
 * 
 * Mode options:
 * - "winsOnly": avgRR = winRR / wins (only winning trades)
 * - "all": avgRR = (winRR + beRR) / (wins + breakEvens) (include BE trades)
 * 
 * @param {Object} ui - UI settings object (from db.ui or appState.ui)
 * @returns {string} - "winsOnly" | "all"
 */
export function getGlobalAvgRRMode(ui) {
  const mode = ui?.avgRRMode;
  return mode === "all" ? "all" : "winsOnly";
}

export default getWinRateModeFromSettings;
