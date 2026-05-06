import React, { useEffect } from "react";
import { Delete } from "lucide-react";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"];

/**
 * Apply a single keypad press to the current value string. Pure — exported
 * for tests.
 *
 * @param {string} current
 * @param {string} key  one of KEYS or "back"
 * @returns {string}
 */
export function applyKey(current, key) {
  const cur = String(current ?? "0");
  if (key === "back") {
    const next = cur.slice(0, -1);
    return next || "0";
  }
  if (key === ".") {
    return cur.includes(".") ? cur : cur + ".";
  }
  if (cur === "0") return key;
  return cur + key;
}

/**
 * Mobile numeric keypad. Drives a string state owned by the caller.
 * Also listens to the physical keyboard while mounted: digits, ".",
 * "," (mapped to "."), Backspace and Enter.
 *
 * @param {{ value: string, onChange: (next: string) => void, onSubmit?: () => void }} props
 */
export default function NumPad({ value, onChange, onSubmit }) {
  useEffect(() => {
    const onKey = (e) => {
      const tag = (document.activeElement?.tagName || "").toLowerCase();
      const editable = document.activeElement?.isContentEditable;
      if (tag === "input" || tag === "textarea" || tag === "select" || editable) return;

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        onChange(applyKey(value, e.key));
      } else if (e.key === "." || e.key === ",") {
        e.preventDefault();
        onChange(applyKey(value, "."));
      } else if (e.key === "Backspace") {
        e.preventDefault();
        onChange(applyKey(value, "back"));
      } else if (e.key === "Enter" && onSubmit) {
        e.preventDefault();
        onSubmit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [value, onChange, onSubmit]);

  const press = (k) => onChange(applyKey(value, k));

  return (
    <div className="grid grid-cols-3 gap-2 select-none">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => press(k)}
          className="h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 text-2xl font-medium text-slate-900 dark:text-slate-100 active:scale-95 transition"
        >
          {k === "back" ? <Delete className="w-6 h-6 mx-auto" /> : k}
        </button>
      ))}
      {onSubmit && (
        <button
          type="button"
          onClick={onSubmit}
          className="col-span-3 h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-lg shadow-lg shadow-emerald-500/30 transition"
        >
          OK
        </button>
      )}
    </div>
  );
}
