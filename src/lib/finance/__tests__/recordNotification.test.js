import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { recordNotification, _resetSentInSession } from "@/lib/finance/recordNotification.js";

describe("recordNotification", () => {
  beforeEach(() => {
    _resetSentInSession();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the first time and dedupes the second", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Map([["content-type", "application/json"]]),
      json: async () => ({ notification: { id: 1 } }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const first = await recordNotification("k", "budget_warn", { name: "Food" });
    const second = await recordNotification("k", "budget_warn", { name: "Food" });
    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("returns false on network error and remembers the key was tried", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const r = await recordNotification("k2", "budget_warn", {});
    expect(r).toBe(false);
    // Same key won't be retried in this session even after failure (in-memory dedupe).
    const again = await recordNotification("k2", "budget_warn", {});
    expect(again).toBe(false);
  });

  it("forgets state after _resetSentInSession", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Map([["content-type", "application/json"]]),
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchSpy);
    await recordNotification("k3", "budget_warn", {});
    _resetSentInSession();
    const again = await recordNotification("k3", "budget_warn", {});
    expect(again).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
