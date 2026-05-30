import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { getRates } from "@/lib/fx.js";

describe("getRates", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("fetches and caches rates against the requested base", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ base: "UAH", rates: { USD: 0.024, EUR: 0.022 } }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { rates, stale } = await getRates("UAH");
    expect(stale).toBe(false);
    expect(rates.UAH_USD).toBeCloseTo(0.024);
    expect(rates.USD_UAH).toBeCloseTo(1 / 0.024);
    expect(rates.UAH_EUR).toBeCloseTo(0.022);

    // Second call should hit cache, not re-fetch
    fetchSpy.mockClear();
    const again = await getRates("UAH");
    expect(again.rates.UAH_USD).toBeCloseTo(0.024);
    expect(again.stale).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("re-fetches when the cached base differs", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ base: "USD", rates: { UAH: 41 } }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    // Pre-seed cache for a different base
    localStorage.setItem(
      "koshyk:fx",
      JSON.stringify({
        base: "UAH",
        rates: { UAH_USD: 0.024 },
        fetchedAt: Date.now(),
      })
    );

    const { rates } = await getRates("USD");
    expect(rates.USD_UAH).toBe(41);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("returns empty rates when the API fails and there's no cache", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("offline"))
    );
    const { rates, stale } = await getRates("UAH");
    expect(rates).toEqual({});
    expect(stale).toBe(true);
  });

  it("falls back to a stale cache when the API fails", async () => {
    const cached = {
      base: "UAH",
      rates: { UAH_USD: 0.025 },
      fetchedAt: Date.now() - 24 * 60 * 60 * 1000, // 24h ago, past TTL
    };
    localStorage.setItem("koshyk:fx", JSON.stringify(cached));

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const { rates, stale } = await getRates("UAH");
    expect(rates.UAH_USD).toBe(0.025);
    expect(stale).toBe(true);
  });
});
