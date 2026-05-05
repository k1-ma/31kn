import React from "react";
import { Delete } from "lucide-react";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"];

/**
 * Mobile numeric keypad. Drives a string state owned by the caller.
 */
export default function NumPad({ value, onChange, onSubmit }) {
  const press = (k) => {
    if (k === "back") {
      const next = String(value || "").slice(0, -1);
      onChange(next || "0");
      return;
    }
    if (k === ".") {
      if (String(value || "").includes(".")) return;
      onChange((value || "0") + ".");
      return;
    }
    const cur = String(value || "0");
    if (cur === "0") onChange(k);
    else onChange(cur + k);
  };
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
