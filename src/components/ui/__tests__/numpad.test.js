import { describe, it, expect } from "vitest";
import { applyKey } from "@/components/ui/NumPad.jsx";

describe("applyKey", () => {
  it("appends digits, replacing leading zero", () => {
    expect(applyKey("0", "5")).toBe("5");
    expect(applyKey("5", "3")).toBe("53");
    expect(applyKey("12", "0")).toBe("120");
  });

  it("appends a single decimal point", () => {
    expect(applyKey("12", ".")).toBe("12.");
    expect(applyKey("12.", ".")).toBe("12.");
    expect(applyKey("12.5", ".")).toBe("12.5");
  });

  it("backspace deletes the last char and snaps to '0'", () => {
    expect(applyKey("123", "back")).toBe("12");
    expect(applyKey("1", "back")).toBe("0");
    expect(applyKey("0", "back")).toBe("0");
    expect(applyKey("", "back")).toBe("0");
  });

  it("handles undefined/null current as '0'", () => {
    expect(applyKey(undefined, "5")).toBe("5");
    expect(applyKey(null, "5")).toBe("5");
  });
});
