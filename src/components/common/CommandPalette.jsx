import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Command } from "lucide-react";
import Input from "@/components/ui/Input.jsx";
import Badge from "@/components/ui/Badge.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";

export default function CommandPalette({ open, setOpen, actions }) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen?.(!open);
      }
      if (e.key === "Escape") setOpen?.(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const filtered = useMemo(() => {
    const all = Array.isArray(actions) ? actions : [];
    const s = String(q || "").trim().toLowerCase();
    if (!s) return all;
    return all.filter((a) => String(a.label || "").toLowerCase().includes(s) || String(a.hint || "").toLowerCase().includes(s));
  }, [actions, q]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[60] flex items-start justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen?.(false)} />

          <motion.div
            ref={boxRef}
            className="relative mt-12 w-full max-w-xl rounded-xl border border-border bg-card/75 glass premium-panel"
            initial={{ opacity: 0, y: 14, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.985 }}
            transition={{ type: "spring", stiffness: 520, damping: 40 }}
          >
            <div className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
              <Command className="h-4 w-4 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("cmd.search")}
                className="h-10 border-0 bg-transparent focus:ring-0"
              />
            </div>

            <div className="max-h-[340px] overflow-auto py-2">
              {filtered.length ? (
                filtered.map((a) => (
                  <button
                    key={a.id}
                    className="group flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-muted/45"
                    onClick={() => {
                      a.onRun?.();
                      setOpen?.(false);
                    }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 shrink-0 rounded-xl border border-border/70 bg-muted/30 flex items-center justify-center">
                        {a.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{a.label}</div>
                        {a.hint ? <div className="text-xs text-muted-foreground truncate">{a.hint}</div> : null}
                      </div>
                    </div>
                    {a.shortcut ? (
                      <Badge variant="outline" className="rounded-full">
                        {a.shortcut}
                      </Badge>
                    ) : null}
                  </button>
                ))
              ) : (
                <div className="p-6 text-center text-sm text-muted-foreground">{t("cmd.noResults")}</div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-border/70 px-4 py-2 text-xs text-muted-foreground">
              <span>{t("cmd.help")}</span>
              <span className="opacity-70">{t("cmd.shortcut")}</span>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
