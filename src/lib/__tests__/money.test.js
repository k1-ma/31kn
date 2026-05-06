import { describe, it, expect } from "vitest";
import {
  toCents,
  fromCents,
  formatMoney,
  sumByCurrency,
  convert,
  totalInBase,
} from "@/lib/money.js";

describe("toCents", () => {
  it("rounds halves up", () => {
    expect(toCents("12.345")).toBe(1235);
    expect(toCents("12.344")).toBe(1234);
  });

  it("accepts comma decimal", () => {
    expect(toCents("12,5")).toBe(1250);
  });

  it("strips whitespace", () => {
    expect(toCents("  100  ")).toBe(10000);
  });

  it("handles negative numbers", () => {
    expect(toCents("-5")).toBe(-500);
  });

  it("returns 0 for garbage", () => {
    expect(toCents("abc")).toBe(0);
    expect(toCents(null)).toBe(0);
    expect(toCents(undefined)).toBe(0);
    expect(toCents("")).toBe(0);
  });

  it("accepts numbers directly", () => {
    expect(toCents(0.1)).toBe(10);
  });
});

describe("fromCents", () => {
  it("divides by 100", () => {
    expect(fromCents(1234)).toBe(12.34);
    expect(fromCents(0)).toBe(0);
  });

  it("survives non-numeric input", () => {
    expect(fromCents(null)).toBe(0);
  });
});

describe("formatMoney", () => {
  it("emits a non-empty currency string", () => {
    const out = formatMoney(1234, "USD", "en");
    expect(out).toMatch(/12\.34/);
    expect(out).toMatch(/\$|USD/);
  });
});

describe("sumByCurrency", () => {
  it("groups totals per currency", () => {
    const totals = sumByCurrency([
      { amount_cents: 100, currency: "UAH" },
      { amount_cents: 200, currency: "UAH" },
      { amount_cents: 50, currency: "USD" },
    ]);
    expect(totals).toEqual({ UAH: 300, USD: 50 });
  });

  it("defaults missing currency to UAH", () => {
    const totals = sumByCurrency([{ amount_cents: 10 }]);
    expect(totals.UAH).toBe(10);
  });
});

describe("convert + totalInBase", () => {
  const rates = { USD_UAH: 41, EUR_UAH: 44 };

  it("returns same value when from === to", () => {
    expect(convert(1000, "UAH", "UAH", rates)).toBe(1000);
  });

  it("converts using the rates map", () => {
    expect(convert(100, "USD", "UAH", rates)).toBe(4100);
  });

  it("returns null when no rate exists", () => {
    expect(convert(100, "JPY", "UAH", rates)).toBe(null);
  });

  it("totals all currencies into the base", () => {
    const total = totalInBase({ UAH: 1000, USD: 100 }, "UAH", rates);
    expect(total).toBe(1000 + 4100);
  });
});
