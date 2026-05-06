import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { applyTheme, getStoredTheme } from "@/lib/theme.js";

describe("theme module", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getStoredTheme defaults to 'system'", () => {
    expect(getStoredTheme()).toBe("system");
  });

  it("getStoredTheme reads stored value", () => {
    localStorage.setItem("koshyk:theme", "dark");
    expect(getStoredTheme()).toBe("dark");
  });

  it("getStoredTheme rejects garbage", () => {
    localStorage.setItem("koshyk:theme", "neon");
    expect(getStoredTheme()).toBe("system");
  });

  it("applyTheme('dark') adds .dark and persists", () => {
    applyTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("koshyk:theme")).toBe("dark");
  });

  it("applyTheme('light') removes .dark and persists", () => {
    document.documentElement.classList.add("dark");
    applyTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("koshyk:theme")).toBe("light");
  });

  it("applyTheme('system') resolves against matchMedia", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    applyTheme("system");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    applyTheme("system");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
