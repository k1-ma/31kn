import { describe, it, expect } from "vitest";
import {
  ENTITIES,
  ENTITY_NAMES,
  rowToDto,
  dtoValueToParam,
  isJsonField,
  validateEntity,
  MAX_AMOUNT_CENTS,
} from "../entityConfig.js";

describe("entityConfig — rowToDto", () => {
  it("maps a wallet row to the client DTO shape", () => {
    const row = {
      id: "wal_1",
      name: "Cash",
      type: "cash",
      currency: "UAH",
      balance_cents: "12345", // BIGINT comes back as a string from node-pg
      color: "#10B981",
      icon: "💵",
      sort_order: 2,
      is_archived: false,
      created_at: new Date("2026-01-01T00:00:00Z"),
      updated_at: new Date("2026-01-02T00:00:00Z"),
      deleted_at: null,
    };
    const dto = rowToDto(ENTITIES.wallets, row);
    expect(dto).toMatchObject({
      id: "wal_1",
      name: "Cash",
      currency: "UAH",
      balance_cents: 12345, // coerced to Number so client `+` never concatenates
      sortOrder: 2,
      isArchived: false,
      deletedAt: null,
    });
    expect(typeof dto.balance_cents).toBe("number");
    expect(dto.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("serializes timestamps and dates correctly", () => {
    const txDto = rowToDto(ENTITIES.transactions, {
      id: "tra_1",
      type: "expense",
      amount_cents: "-500",
      currency: "UAH",
      wallet_id: "wal_1",
      category_id: "cat_1",
      to_wallet_id: null,
      date: new Date("2026-03-15T10:00:00Z"),
      note: "Coffee",
      tags: ["food"],
      recurring_id: null,
      created_at: new Date("2026-03-15T10:00:00Z"),
      updated_at: new Date("2026-03-15T10:00:00Z"),
      deleted_at: null,
    });
    expect(txDto.walletId).toBe("wal_1");
    expect(txDto.categoryId).toBe("cat_1");
    expect(txDto.amount_cents).toBe(-500);
    expect(txDto.date).toBe("2026-03-15T10:00:00.000Z");
    expect(txDto.tags).toEqual(["food"]);
  });

  it("returns a YYYY-MM-DD string for DATE columns", () => {
    const dto = rowToDto(ENTITIES.budgets, {
      id: "bud_1",
      name: "Food",
      category_ids: ["cat_1"],
      period: "monthly",
      start_date: new Date("2026-04-01T00:00:00Z"),
      end_date: null,
      limit_cents: "100000",
      currency: "UAH",
      rollover: false,
      alert_at: 80,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
    });
    expect(dto.startDate).toBe("2026-04-01");
    expect(dto.categoryIds).toEqual(["cat_1"]);
    expect(dto.alertAt).toBe(80);
  });
});

describe("entityConfig — dtoValueToParam", () => {
  it("skips fields that are not present (partial update)", () => {
    const f = ENTITIES.wallets.fields.find((x) => x.key === "name");
    expect(dtoValueToParam(f, {})).toBeUndefined();
    expect(dtoValueToParam(f, { name: "X" })).toBe("X");
  });

  it("stringifies JSON fields and casts cents to Number", () => {
    const tags = ENTITIES.transactions.fields.find((x) => x.key === "tags");
    expect(isJsonField(tags)).toBe(true);
    expect(dtoValueToParam(tags, { tags: ["a", "b"] })).toBe('["a","b"]');

    const cents = ENTITIES.transactions.fields.find((x) => x.key === "amount_cents");
    expect(dtoValueToParam(cents, { amount_cents: "250" })).toBe(250);
  });
});

describe("entityConfig — validateEntity", () => {
  it("requires the configured required fields on create", () => {
    expect(validateEntity(ENTITIES.wallets, { type: "cash", currency: "UAH" }).valid).toBe(false);
    expect(validateEntity(ENTITIES.wallets, { name: "Cash", type: "cash", currency: "UAH" }).valid).toBe(true);
  });

  it("does not require fields on partial update", () => {
    expect(validateEntity(ENTITIES.wallets, { balance_cents: 100 }, { partial: true }).valid).toBe(true);
  });

  it("rejects out-of-range or non-integer cents", () => {
    expect(validateEntity(ENTITIES.transactions, { type: "expense", currency: "UAH", amount_cents: 1.5 }).valid).toBe(false);
    expect(validateEntity(ENTITIES.transactions, { type: "expense", currency: "UAH", amount_cents: MAX_AMOUNT_CENTS + 1 }).valid).toBe(false);
    expect(validateEntity(ENTITIES.transactions, { type: "expense", currency: "UAH", amount_cents: -500 }).valid).toBe(true);
  });
});

describe("entityConfig — coverage", () => {
  it("exposes all seven finance collections", () => {
    expect(ENTITY_NAMES).toEqual([
      "wallets",
      "categories",
      "transactions",
      "budgets",
      "goals",
      "recurring",
      "debts",
    ]);
  });
});
