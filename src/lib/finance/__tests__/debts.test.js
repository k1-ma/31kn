import { describe, it, expect } from "vitest";
import { transactionForSettle } from "@/lib/finance/debts.js";

describe("transactionForSettle", () => {
  const wallet = { id: "w1", currency: "UAH", icon: "💵", name: "Cash" };

  it("`owe` produces an expense", () => {
    const debt = {
      id: "d1",
      direction: "owe",
      amount_cents: 12345,
      currency: "UAH",
      counterparty: "Alice",
      note: "lunch",
    };
    const tx = transactionForSettle(debt, wallet, "2026-04-01");
    expect(tx.type).toBe("expense");
    expect(tx.amount_cents).toBe(12345);
    expect(tx.currency).toBe("UAH");
    expect(tx.walletId).toBe("w1");
    expect(tx.categoryId).toBeNull();
    expect(tx.debtId).toBe("d1");
    expect(tx.date).toBe("2026-04-01T00:00:00.000Z");
    expect(tx.note).toContain("Alice");
    expect(tx.note).toContain("lunch");
  });

  it("`owed` produces an income", () => {
    const debt = {
      id: "d2",
      direction: "owed",
      amount_cents: 5000,
      currency: "UAH",
      counterparty: "Bob",
    };
    const tx = transactionForSettle(debt, wallet);
    expect(tx.type).toBe("income");
    expect(tx.note).toBe("Bob");
  });

  it("uses the wallet's currency over the debt's", () => {
    const debt = { id: "d3", direction: "owe", amount_cents: 100, currency: "USD" };
    const tx = transactionForSettle(debt, { id: "w2", currency: "UAH" });
    expect(tx.currency).toBe("UAH");
  });

  it("throws when debt or wallet are missing", () => {
    expect(() => transactionForSettle(null, wallet)).toThrow();
    expect(() => transactionForSettle({ direction: "owe" }, null)).toThrow();
  });

  it("clamps the note length", () => {
    const long = "x".repeat(500);
    const tx = transactionForSettle(
      { id: "d", direction: "owe", amount_cents: 1, currency: "UAH", counterparty: long },
      wallet
    );
    expect(tx.note.length).toBeLessThanOrEqual(200);
  });
});
