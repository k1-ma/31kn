/**
 * @fileoverview Unit tests for the i18n plural-form selector.
 * The runtime is provider-internal, so this test re-implements the
 * exact same pickPluralForm rules that I18nProvider uses, then asserts
 * the CLDR categories for ru/uk/en across the boundary cases that real
 * code (deleteSelectedConfirmMessagePlural etc.) depends on.
 *
 * Run with: node src/i18n/__tests__/plural.test.js
 */

// Re-implementation kept in sync with I18nProvider.jsx → pluralCategory.
function pluralCategory(lang, count) {
  const n = Math.abs(Number(count) || 0);
  if (lang === "ru" || lang === "uk") {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return "one";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "few";
    return "many";
  }
  return n === 1 ? "one" : "other";
}

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`✓ ${name}`); }
  catch (e) { failed++; console.log(`✗ ${name}\n  ${e.message}`); }
}
function eq(a, b) {
  if (a !== b) throw new Error(`expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`);
}

// ─── English binary ─────────────────────────────────────────────────────────
test("EN: 0 → other", () => eq(pluralCategory("en", 0), "other"));
test("EN: 1 → one", () => eq(pluralCategory("en", 1), "one"));
test("EN: 2 → other", () => eq(pluralCategory("en", 2), "other"));
test("EN: 21 → other (no special case)", () => eq(pluralCategory("en", 21), "other"));

// ─── Russian Slavic ─────────────────────────────────────────────────────────
test("RU: 1 → one", () => eq(pluralCategory("ru", 1), "one"));
test("RU: 2 → few", () => eq(pluralCategory("ru", 2), "few"));
test("RU: 3 → few", () => eq(pluralCategory("ru", 3), "few"));
test("RU: 4 → few", () => eq(pluralCategory("ru", 4), "few"));
test("RU: 5 → many", () => eq(pluralCategory("ru", 5), "many"));
test("RU: 11 → many (teen exception)", () => eq(pluralCategory("ru", 11), "many"));
test("RU: 12 → many (teen exception)", () => eq(pluralCategory("ru", 12), "many"));
test("RU: 13 → many (teen exception)", () => eq(pluralCategory("ru", 13), "many"));
test("RU: 14 → many (teen exception)", () => eq(pluralCategory("ru", 14), "many"));
test("RU: 21 → one (mod10=1, mod100=21 ≠ 11)", () => eq(pluralCategory("ru", 21), "one"));
test("RU: 22 → few", () => eq(pluralCategory("ru", 22), "few"));
test("RU: 25 → many", () => eq(pluralCategory("ru", 25), "many"));
test("RU: 101 → one", () => eq(pluralCategory("ru", 101), "one"));
test("RU: 111 → many (teen exception)", () => eq(pluralCategory("ru", 111), "many"));
test("RU: 0 → many (Russian uses many for zero)", () => eq(pluralCategory("ru", 0), "many"));

// ─── Ukrainian (same Slavic rules) ──────────────────────────────────────────
test("UK: 1 → one", () => eq(pluralCategory("uk", 1), "one"));
test("UK: 2 → few", () => eq(pluralCategory("uk", 2), "few"));
test("UK: 5 → many", () => eq(pluralCategory("uk", 5), "many"));
test("UK: 11 → many", () => eq(pluralCategory("uk", 11), "many"));

// ─── Negative / NaN guards ──────────────────────────────────────────────────
test("RU: -1 → one (abs)", () => eq(pluralCategory("ru", -1), "one"));
test("RU: NaN → many (treated as 0)", () => eq(pluralCategory("ru", NaN), "many"));
test("EN: NaN → other", () => eq(pluralCategory("en", NaN), "other"));

console.log(`\n=== Results ===\nPassed: ${passed}\nFailed: ${failed}`);
if (failed > 0) process.exit(1);
