import { describe, it, expect } from "vitest";
import { mapAuthError, fieldError } from "@/lib/authErrors.js";

// Minimal `t()` stand-in: returns the dictionary entry if known, else
// the fallback (mimics how I18nProvider behaves for missing keys).
function makeT(dict) {
  return (key, _vars, fallback = "") => dict[key] ?? fallback;
}

const dict = {
  "auth.errors.PASSWORD_TOO_SHORT": "Пароль закороткий",
  "auth.errors.EMAIL_EXISTS": "Цей email вже використовується",
  "errors.generic": "Щось пішло не так",
};

describe("mapAuthError", () => {
  const t = makeT(dict);

  it("returns translated string when errorCode is known", () => {
    expect(mapAuthError({ errorCode: "PASSWORD_TOO_SHORT" }, t)).toBe("Пароль закороткий");
  });

  it("falls back to server `error` when code is unknown", () => {
    expect(
      mapAuthError({ errorCode: "MYSTERY_CODE", error: "Mystery happened" }, t)
    ).toBe("Mystery happened");
  });

  it("falls back to generic when no code/error", () => {
    expect(mapAuthError({}, t)).toBe("Щось пішло не так");
  });

  it("returns generic for null/undefined response", () => {
    expect(mapAuthError(null, t)).toBe("Щось пішло не так");
    expect(mapAuthError(undefined, t)).toBe("Щось пішло не так");
  });

  it("accepts shorthand `code` field", () => {
    expect(mapAuthError({ code: "EMAIL_EXISTS" }, t)).toBe("Цей email вже використовується");
  });
});

describe("fieldError", () => {
  const t = makeT(dict);

  it("returns translated message when field matches", () => {
    expect(
      fieldError({ field: "password", errorCode: "PASSWORD_TOO_SHORT" }, "password", t)
    ).toBe("Пароль закороткий");
  });

  it("returns null when field doesn't match", () => {
    expect(
      fieldError({ field: "email", errorCode: "EMAIL_EXISTS" }, "password", t)
    ).toBeNull();
  });

  it("returns null when response is empty", () => {
    expect(fieldError(null, "password", t)).toBeNull();
  });
});
