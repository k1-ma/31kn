import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import Button from "@/components/ui/Button.jsx";
import { X } from "lucide-react";
import { useAnimationsEnabled } from "@/lib/animations.jsx";

export default function ToastViewport({ toasts, onClose }) {
  const animationsEnabled = useAnimationsEnabled();
  
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 mx-auto flex max-w-2xl flex-col gap-2 px-4">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={animationsEnabled ? { opacity: 0, y: 16, scale: 0.98 } : { opacity: 1 }}
            animate={animationsEnabled ? { opacity: 1, y: 0, scale: 1 } : { opacity: 1 }}
            exit={animationsEnabled ? { opacity: 0, y: 16, scale: 0.98 } : { opacity: 0 }}
            transition={animationsEnabled ? { type: "spring", stiffness: 500, damping: 35 } : { duration: 0 }}
            className="pointer-events-auto"
          >
            <div className="flex items-start justify-between gap-3 rounded-xl border border-[rgb(var(--border))] bg-[rgb(var(--card))]/90 glass p-3 shadow-lg">
              <div className="min-w-0">
                <div className="text-sm font-semibold">{t.title}</div>
                {t.description ? <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-300">{t.description}</div> : null}
              </div>
              <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => onClose(t.id)} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
