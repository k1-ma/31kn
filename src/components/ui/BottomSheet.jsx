import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

export default function BottomSheet({ open, onClose, title, children, footer, maxWidth = 560 }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 280 }}
            className="fixed inset-x-0 bottom-0 z-50 flex justify-center pb-[env(safe-area-inset-bottom)]"
            role="dialog"
            aria-modal="true"
          >
            <div
              className="w-full bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl max-h-[92vh] flex flex-col"
              style={{ maxWidth }}
            >
              <div className="pt-2 pb-1 flex justify-center">
                <span className="block w-10 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700" />
              </div>
              {(title || onClose) && (
                <div className="flex items-center justify-between px-5 pt-2 pb-3">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
                  {onClose && (
                    <button
                      type="button"
                      onClick={onClose}
                      className="p-2 -mr-2 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                      aria-label="Close"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>
              )}
              <div className="flex-1 overflow-y-auto px-5 pb-4">{children}</div>
              {footer && (
                <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800">
                  {footer}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
