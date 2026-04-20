import React, { useEffect, useMemo, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useAnimationsEnabled } from "@/lib/animations.jsx";

function getFocusable(container) {
  if (!container) return [];
  const sel = [
    "a[href]",
    "button:not([disabled])",
    "textarea:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");
  return Array.from(container.querySelectorAll(sel)).filter((el) => el && el.offsetParent !== null);
}

// Size presets for different modal types
const SIZE_CLASSES = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-6xl",
  full: "max-w-[calc(100vw-2rem)]",
};

export default function Modal({ 
  open, 
  onOpenChange, 
  onClose, // alias for onOpenChange
  title, 
  children, 
  reduceMotion: reduceMotionProp,
  size = "lg", // sm, md, lg, xl, full
  showCloseButton = true,
}) {
  const panelRef = useRef(null);
  const titleId = useMemo(() => `modal_${Math.random().toString(16).slice(2)}`, []);
  const prevFocusRef = useRef(null);
  const animationsEnabled = useAnimationsEnabled();
  
  // Use prop if provided, otherwise use global setting
  const reduceMotion = reduceMotionProp !== undefined ? reduceMotionProp : !animationsEnabled;
  
  // Support both onClose and onOpenChange - use useCallback for stable reference
  const handleClose = useCallback(() => {
    onClose?.();
    onOpenChange?.(false);
  }, [onClose, onOpenChange]);
  
  // Use ref to store latest handleClose for event listeners
  const handleCloseRef = useRef(handleClose);
  useEffect(() => {
    handleCloseRef.current = handleClose;
  }, [handleClose]);

  useEffect(() => {
    if (!open) return;

    // Save previous focus & lock scroll
    prevFocusRef.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus first focusable in modal (or panel as fallback)
    const t = window.setTimeout(() => {
      const focusables = getFocusable(panelRef.current);
      (focusables[0] || panelRef.current)?.focus?.();
    }, 0);

    const onKey = (e) => {
      if (e.key === "Escape") handleCloseRef.current();

      // Basic focus trap
      if (e.key === "Tab") {
        const focusables = getFocusable(panelRef.current);
        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const isShift = e.shiftKey;

        if (isShift && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!isShift && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      // Restore focus
      const prev = prevFocusRef.current;
      if (prev && typeof prev.focus === "function") prev.focus();
    };
  }, [open]);

  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.lg;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 overflow-y-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          aria-hidden={false}
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
          />

          <motion.div
            className={`relative mx-auto my-2 sm:my-4 md:my-8 w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] ${sizeClass}`}
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 14, scale: 0.98 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 14, scale: 0.98 }}
            transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 38 }}
          >
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              className="rounded-xl sm:rounded-xl border border-border/50 dark:border-white/[0.08] bg-card dark:bg-[#131722] shadow-xl dark:shadow-[0_8px_40px_rgba(0,0,0,0.5)] outline-none max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-2rem)] md:max-h-[calc(100vh-4rem)] flex flex-col"
            >
              {/* Header */}
              <div className="px-3 sm:px-6 py-3 sm:py-5 border-b border-border/30 dark:border-white/[0.06] shrink-0 flex items-center justify-between gap-2 rounded-t-xl">
                <div id={titleId} className="text-sm sm:text-lg font-semibold truncate tracking-wide">
                  {title}
                </div>
                {showCloseButton && (
                  <button
                    type="button"
                    onClick={handleClose}
                    className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 dark:hover:bg-white/[0.06] transition-all duration-200"
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}
              </div>
              
              {/* Content - scrollable but allowing dropdowns to overflow */}
              <div className="px-3 sm:px-6 py-3 sm:py-5 overflow-y-auto overflow-x-visible flex-1 overscroll-contain">{children}</div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
