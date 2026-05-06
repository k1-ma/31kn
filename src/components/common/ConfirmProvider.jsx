import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import BottomSheet from "@/components/ui/BottomSheet.jsx";
import Button from "@/components/ui/Button.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";

const ConfirmCtx = createContext(null);

/**
 * Promise-based confirm dialog.
 *
 * const confirm = useConfirm();
 * const ok = await confirm({ title, body, danger: true, label: "Delete" });
 * if (ok) doIt();
 */
export function ConfirmProvider({ children }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useCallback((options = {}) => {
    setOpts({
      title: options.title || t("common.confirm"),
      body: options.body || "",
      label: options.label || t("common.confirm"),
      cancelLabel: options.cancelLabel || t("common.cancel"),
      danger: !!options.danger,
    });
    setOpen(true);
    return new Promise((resolve) => {
      resolverRef.current = resolve;
    });
  }, [t]);

  const finish = (result) => {
    setOpen(false);
    const r = resolverRef.current;
    resolverRef.current = null;
    if (r) r(result);
  };

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <BottomSheet open={open} onClose={() => finish(false)} title={opts?.title}>
        <div className="space-y-4">
          {opts?.body && (
            <p className="text-sm text-slate-600 dark:text-slate-300">{opts.body}</p>
          )}
          <div className="flex gap-2 pt-1">
            <Button
              variant="secondary"
              size="lg"
              className="flex-1"
              onClick={() => finish(false)}
            >
              {opts?.cancelLabel}
            </Button>
            <Button
              variant={opts?.danger ? "danger" : "primary"}
              size="lg"
              className="flex-1"
              onClick={() => finish(true)}
            >
              {opts?.label}
            </Button>
          </div>
        </div>
      </BottomSheet>
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error("useConfirm must be used inside <ConfirmProvider/>");
  return ctx;
}
