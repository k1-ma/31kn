import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import Button from "./Button.jsx";

export default function ConfirmDialog({ open, onConfirm, onCancel, title, message, confirmLabel, variant = "danger" }) {
  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm"
            onClick={onCancel}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          >
            <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6">
              <div className="flex items-start gap-3 mb-4">
                <span className="mt-0.5 p-2 rounded-full bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400">
                  <AlertTriangle className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
                  {message && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{message}</p>}
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
                <Button variant={variant} size="sm" onClick={onConfirm}>{confirmLabel || "Delete"}</Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
