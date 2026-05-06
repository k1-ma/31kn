import React, { useState } from "react";
import { X } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider.jsx";

/**
 * Lightweight tag-chip input. Tags are normalized to lowercase, deduped,
 * and stored as a string[]. Enter / "," / Tab commits the current draft.
 */
export default function TagsInput({ value = [], onChange, suggestions = [] }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");

  const commit = (raw) => {
    const tag = String(raw || draft || "").trim().toLowerCase().replace(/^#+/, "");
    if (!tag) return;
    if (value.includes(tag)) {
      setDraft("");
      return;
    }
    onChange?.([...value, tag]);
    setDraft("");
  };

  const remove = (tag) => onChange?.(value.filter((x) => x !== tag));

  const onKeyDown = (e) => {
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      if (draft.trim()) {
        e.preventDefault();
        commit();
      }
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange?.(value.slice(0, -1));
    }
  };

  const fresh = suggestions.filter(
    (s) => !value.includes(s) && (!draft || s.includes(draft.toLowerCase()))
  ).slice(0, 6);

  return (
    <div>
      <div className="min-h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 flex flex-wrap items-center gap-1">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 h-7 px-2 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-xs font-medium"
          >
            #{tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              aria-label="Remove tag"
              className="opacity-60 hover:opacity-100"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => draft.trim() && commit()}
          placeholder={value.length === 0 ? t("tagsInput.placeholder") : ""}
          className="flex-1 min-w-[80px] bg-transparent outline-none text-sm h-9 px-1 text-slate-900 dark:text-slate-100"
        />
      </div>
      {fresh.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {fresh.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => commit(s)}
              className="inline-flex h-6 items-center px-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px]"
            >
              #{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
