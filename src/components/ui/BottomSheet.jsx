import React, { useEffect, useRef } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { X } from "lucide-react";

const FOCUSABLE_SELECTOR =
  'button, [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Bottom sheet modal.
 * - Drag the handle (or anywhere on the header) down past 30% of the sheet
 *   height to dismiss.
 * - Focus is trapped inside while open; restores to the previously-focused
 *   element on close.
 * - Tracks visualViewport to stay above the on-screen keyboard.
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   title?: string,
 *   children: React.ReactNode,
 *   footer?: React.ReactNode,
 *   maxWidth?: number,
 * }} props
 */
export default function BottomSheet({ open, onClose, title, children, footer, maxWidth = 560 }) {
  const sheetRef = useRef(null);
  const previousActiveRef = useRef(null);
  const y = useMotionValue(0);
  const overlayOpacity = useTransform(y, [0, 400], [1, 0]);

  useEffect(() => {
    if (!open) return;
    previousActiveRef.current = document.activeElement;
    const onKey = (e) => {
      if (e.key === "Escape") {
        onClose?.();
        return;
      }
      if (e.key === "Tab") {
        const sheet = sheetRef.current;
        if (!sheet) return;
        const focusables = Array.from(sheet.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
          (el) => !el.hasAttribute("disabled") && el.offsetParent !== null
        );
        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";

    // Move focus into the sheet so screen readers and Tab start inside.
    const t = window.setTimeout(() => {
      const sheet = sheetRef.current;
      if (!sheet) return;
      const first = sheet.querySelector(FOCUSABLE_SELECTOR);
      if (first) first.focus();
      else sheet.focus();
    }, 50);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      window.clearTimeout(t);
      // Restore focus to whatever launched the sheet.
      const prev = previousActiveRef.current;
      if (prev && typeof prev.focus === "function") {
        try {
          prev.focus({ preventScroll: true });
        } catch {}
      }
    };
  }, [open, onClose]);

  // Visual viewport (mobile keyboard pushes sheet up). Sets a CSS variable
  // the sheet style consumes so it stays visible while the keyboard is up.
  useEffect(() => {
    if (!open) return;
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const update = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty("--vv-bottom", `${offset}px`);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      document.documentElement.style.setProperty("--vv-bottom", "0px");
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [open]);

  const handleDragEnd = (_event, info) => {
    const sheet = sheetRef.current;
    const h = sheet?.offsetHeight || 600;
    if (info.offset.y > h * 0.3 || info.velocity.y > 600) {
      onClose?.();
    } else {
      y.set(0);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ opacity: overlayOpacity }}
            className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={sheetRef}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 280 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            dragMomentum={false}
            onDragEnd={handleDragEnd}
            style={{ y, paddingBottom: "var(--vv-bottom, 0px)" }}
            className="fixed inset-x-0 bottom-0 z-50 flex justify-center pb-[env(safe-area-inset-bottom)]"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
          >
            <div
              className="w-full bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl max-h-[92vh] flex flex-col"
              style={{ maxWidth }}
            >
              <div className="pt-2 pb-1 flex justify-center cursor-grab active:cursor-grabbing">
                <span className="block w-10 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700" />
              </div>
              {(title || onClose) && (
                <div className="flex items-center justify-between px-5 pt-2 pb-3">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {title}
                  </h2>
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
