import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";

const ToastCtx = createContext({ push: () => {}, remove: () => {} });

const ICONS = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertTriangle,
  info: Info,
};

const COLORS = {
  success: "bg-indigo-50 border-indigo-200 text-indigo-800 dark:bg-indigo-950 dark:border-indigo-900 dark:text-indigo-200",
  warning: "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950 dark:border-amber-900 dark:text-amber-200",
  error: "bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-900 dark:text-red-200",
  info: "bg-slate-50 border-slate-200 text-slate-800 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-200",
};

let _id = 0;

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const remove = useCallback((id) => {
    setItems((p) => p.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (toast) => {
      const id = ++_id;
      const next = {
        id,
        kind: toast.kind || "info",
        title: toast.title || "",
        body: toast.body || "",
        duration: toast.duration ?? 4000,
      };
      setItems((p) => [next, ...p].slice(0, 4));
      if (next.duration > 0) {
        window.setTimeout(() => remove(id), next.duration);
      }
      return id;
    },
    [remove]
  );

  const value = useMemo(() => ({ push, remove }), [push, remove]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div
        className="fixed inset-x-0 top-3 z-[10000] flex flex-col items-center gap-2 px-3 pointer-events-none"
        aria-live="polite"
        aria-atomic="false"
      >
        {items.map((t) => {
          const Icon = ICONS[t.kind] || Info;
          return (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto w-full max-w-md rounded-2xl border px-4 py-3 shadow-lg flex items-start gap-3 animate-fadeUp ${COLORS[t.kind] || COLORS.info}`}
            >
              <Icon className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 text-sm">
                {t.title && <div className="font-semibold">{t.title}</div>}
                {t.body && <div className="opacity-90">{t.body}</div>}
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => remove(t.id)}
                className="-mr-1 -mt-0.5 p-1 rounded-md opacity-60 hover:opacity-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}
