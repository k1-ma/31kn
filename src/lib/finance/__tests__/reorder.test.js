import { describe, it, expect } from "vitest";
import { reorderSiblings } from "@/lib/finance/reorder.js";

const items = [
  { id: "a", sortOrder: 0, kind: "expense" },
  { id: "b", sortOrder: 1, kind: "expense" },
  { id: "c", sortOrder: 2, kind: "expense" },
  { id: "x", sortOrder: 0, kind: "income" },
];

describe("reorderSiblings", () => {
  it("returns null when the item is at the top and dir is up", () => {
    expect(reorderSiblings(items, items[0], -1, (x) => x.kind === "expense")).toBeNull();
  });

  it("returns null when the item is at the bottom and dir is down", () => {
    expect(reorderSiblings(items, items[2], 1, (x) => x.kind === "expense")).toBeNull();
  });

  it("swaps sortOrder values between adjacent items", () => {
    const swap = reorderSiblings(items, items[1], -1, (x) => x.kind === "expense");
    expect(swap).toHaveLength(2);
    expect(swap[0].id).toBe("b");
    expect(swap[0].sortOrder).toBe(0);
    expect(swap[1].id).toBe("a");
    expect(swap[1].sortOrder).toBe(1);
  });

  it("respects the predicate (only siblings of the same kind move)", () => {
    const swap = reorderSiblings(items, items[3], 1, (x) => x.kind === "income");
    expect(swap).toBeNull();
  });

  it("ignores soft-deleted items", () => {
    const list = [
      { id: "a", sortOrder: 0 },
      { id: "b", sortOrder: 1, deletedAt: new Date().toISOString() },
      { id: "c", sortOrder: 2 },
    ];
    const swap = reorderSiblings(list, list[0], 1);
    expect(swap.map((x) => x.id)).toEqual(["a", "c"]);
  });
});
