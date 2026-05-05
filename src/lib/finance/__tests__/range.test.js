import { describe, it, expect } from "vitest";
import { rangeFromPreset, RANGE_PRESETS } from "@/lib/finance/range.js";

describe("rangeFromPreset", () => {
  it("returns ISO strings for every preset", () => {
    for (const p of RANGE_PRESETS) {
      const { start, end } = rangeFromPreset(p, new Date("2026-04-15T12:34:56Z"));
      expect(typeof start).toBe("string");
      expect(typeof end).toBe("string");
      expect(new Date(start).getTime()).toBeLessThan(new Date(end).getTime());
    }
  });

  it("today: midnight → next midnight", () => {
    const { start, end } = rangeFromPreset("today", new Date("2026-04-15T12:34:56Z"));
    expect(new Date(start).getDate()).toBe(15);
    expect(new Date(end).getTime() - new Date(start).getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("month: 1st → 1st of next month", () => {
    const { start, end } = rangeFromPreset("month", new Date("2026-04-15"));
    expect(start.slice(0, 10)).toBe("2026-04-01");
    expect(end.slice(0, 10)).toBe("2026-05-01");
  });

  it("quarter: Q2 covers Apr-Jun", () => {
    const { start, end } = rangeFromPreset("quarter", new Date("2026-05-15"));
    expect(start.slice(0, 10)).toBe("2026-04-01");
    expect(end.slice(0, 10)).toBe("2026-07-01");
  });

  it("year: Jan 1 → next Jan 1", () => {
    const { start, end } = rangeFromPreset("year", new Date("2026-07-04"));
    expect(start.slice(0, 10)).toBe("2026-01-01");
    expect(end.slice(0, 10)).toBe("2027-01-01");
  });

  it("all: spans a wide window", () => {
    const { start, end } = rangeFromPreset("all", new Date());
    expect(new Date(end).getFullYear()).toBeGreaterThan(2100);
    expect(new Date(start).getFullYear()).toBeLessThan(2000);
  });
});
