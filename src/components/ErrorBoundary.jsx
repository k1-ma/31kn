import React from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("UI crashed:", error, info);
  }

  render() {
    const err = this.state.error;
    if (!err) return this.props.children;

    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-3xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-[0_2px_18px_rgba(15,23,42,0.04)]">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-red-50 dark:bg-red-950 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <div className="text-base font-semibold">Щось пішло не так</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Something went wrong
              </div>
            </div>
          </div>
          <pre className="text-xs whitespace-pre-wrap rounded-xl bg-slate-50 dark:bg-slate-800 p-3 overflow-auto max-h-48 text-slate-700 dark:text-slate-300">
            {String(err?.message || err)}
          </pre>
          <div className="flex gap-2">
            <button
              type="button"
              className="flex-1 inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="w-4 h-4" /> Reload
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              onClick={() => window.location.assign("/")}
            >
              <Home className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }
}
