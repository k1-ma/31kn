/**
 * Map a server-returned errorCode to a translated, user-friendly string.
 * Falls back to the original `error` field, or a generic message.
 *
 * Server sends: { error: string, errorCode?: string, field?: string }
 *
 * @param {{ errorCode?: string, error?: string, field?: string } | null | undefined} response
 * @param {(key: string, vars?: object, fallback?: string) => string} t
 * @returns {string}
 */
export function mapAuthError(response, t) {
  if (!response) return t("errors.generic");
  const code = response.errorCode || response.code;
  if (code) {
    const translated = t(`auth.errors.${code}`, null, "");
    if (translated) return translated;
  }
  return response.error || t("errors.generic");
}

/**
 * For inline per-field errors. Returns null when the failure isn't tied
 * to the asked-about field, so the caller can decide which input to mark
 * with aria-invalid.
 *
 * @param {{ errorCode?: string, field?: string, error?: string }} response
 * @param {string} field
 * @param {(key: string, vars?: object, fallback?: string) => string} t
 * @returns {string | null}
 */
export function fieldError(response, field, t) {
  if (!response || response.field !== field) return null;
  return mapAuthError(response, t);
}
