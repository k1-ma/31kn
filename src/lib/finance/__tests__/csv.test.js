import { describe, it, expect } from "vitest";
import { parseCsv, csvToTransactions } from "@/lib/finance/csv.js";

describe("parseCsv", () => {
  it("parses a basic CSV", () => {
    const out = parseCsv("a,b,c\n1,2,3\n4,5,6\n");
    expect(out).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });

  it("handles quoted commas and escaped quotes", () => {
    const out = parseCsv(`name,note\n"John, Jr","Says ""hi"""\n`);
    expect(out).toEqual([
      ["name", "note"],
      ["John, Jr", `Says "hi"`],
    ]);
  });

  it("handles CRLF line endings", () => {
    const out = parseCsv("a,b\r\n1,2\r\n");
    expect(out).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("csvToTransactions", () => {
  const wallets = [
    { id: "w1", name: "Cash", currency: "UAH" },
    { id: "w2", name: "Card", currency: "UAH" },
  ];
  const categories = [
    { id: "c1", name: "Food", kind: "expense" },
    { id: "c2", name: "Salary", kind: "income" },
  ];

  it("maps wallet/category names to ids", () => {
    const csv =
      "date,type,amount,currency,wallet,category,note\n" +
      "2026-03-01,expense,12.50,UAH,Cash,Food,Lunch\n" +
      "2026-03-02,income,5000,UAH,Card,Salary,March pay\n";
    const out = csvToTransactions(csv, { wallets, categories });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      type: "expense",
      amount_cents: 1250,
      walletId: "w1",
      categoryId: "c1",
      note: "Lunch",
    });
    expect(out[1]).toMatchObject({
      type: "income",
      amount_cents: 500000,
      walletId: "w2",
      categoryId: "c2",
    });
  });

  it("skips invalid types and zero/negative amounts", () => {
    const csv =
      "date,type,amount,currency,wallet,category,note\n" +
      "2026-03-01,bogus,10,UAH,Cash,Food,\n" +
      "2026-03-01,expense,0,UAH,Cash,Food,\n" +
      "2026-03-01,expense,5,UAH,Cash,Food,ok\n";
    const out = csvToTransactions(csv, { wallets, categories });
    expect(out).toHaveLength(1);
    expect(out[0].note).toBe("ok");
  });

  it("returns empty list when only header is present", () => {
    const out = csvToTransactions("date,type,amount\n", { wallets, categories });
    expect(out).toEqual([]);
  });
});
