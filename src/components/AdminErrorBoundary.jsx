import React from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

/**
 * Error Boundary specifically for the Admin Panel.
 * Shows a visible error screen instead of a black screen when something crashes.
 * Logs errors to console and optionally to the server.
 */
export class AdminErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    
    // Log to console
    console.error("Admin panel crashed:", error, errorInfo);

    // Attempt to log to server (fire-and-forget, don't block on errors)
    this.logErrorToServer(error, errorInfo);
  }

  async logErrorToServer(error, errorInfo) {
    try {
      const payload = {
        action: "client_error",
        meta: {
          errorMessage: error?.message || String(error),
          stack: error?.stack || null,
          componentStack: errorInfo?.componentStack || null,
          route: typeof window !== "undefined" ? window.location.pathname : null,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
          timestamp: new Date().toISOString(),
        },
      };

      await fetch("/api/admin/log-client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
    } catch (logError) {
      // Silently ignore logging errors - we don't want to cause more issues
      console.warn("Failed to log error to server:", logError);
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoToDashboard = () => {
    window.location.href = "/admincrm-panel/dashboard";
  };

  render() {
    const { error, errorInfo } = this.state;
    
    if (!error) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-6">
        <div className="w-full max-w-lg">
          {/* Error card */}
          <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-rose-500/5 p-6 backdrop-blur-sm shadow-2xl">
            {/* Icon and title */}
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-amber-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-amber-400">
                  Admin Panel Crashed
                </h1>
                <p className="text-sm text-gray-400">
                  An unexpected error occurred
                </p>
              </div>
            </div>

            {/* Error message */}
            <div className="mb-4 text-sm text-gray-300">
              The admin panel encountered a runtime error and stopped rendering. 
              This error has been logged for investigation.
            </div>

            {/* Error details */}
            <div className="mb-6 rounded-xl border border-gray-700/50 bg-gray-900/50 p-4 overflow-hidden">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-2 font-semibold">
                Error Details
              </div>
              <pre className="text-xs text-rose-400 whitespace-pre-wrap break-words overflow-auto max-h-32">
                {error?.message || String(error)}
              </pre>
              {error?.stack && (
                <details className="mt-3">
                  <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400">
                    Show stack trace
                  </summary>
                  <pre className="mt-2 text-[10px] text-gray-500 whitespace-pre-wrap break-words overflow-auto max-h-40">
                    {error.stack}
                  </pre>
                </details>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={this.handleReload}
                className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-semibold transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Reload Page
              </button>
              <button
                onClick={this.handleGoToDashboard}
                className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl border border-gray-600 hover:bg-gray-800 text-gray-300 font-medium transition-colors"
              >
                <Home className="h-4 w-4" />
                Go to Dashboard
              </button>
            </div>
          </div>

          {/* Footer hint */}
          <div className="mt-4 text-center text-xs text-gray-600">
            If this error persists, please contact the system administrator.
          </div>
        </div>
      </div>
    );
  }
}

export default AdminErrorBoundary;
