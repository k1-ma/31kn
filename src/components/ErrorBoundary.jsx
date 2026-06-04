import React from "react";

/**
 * Simple runtime guard to avoid a "black screen" when an exception happens.
 * Shows the error and offers a reload button.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {

    console.error("UI crashed:", error, info);
  }

  render() {
    const err = this.state.error;
    if (!err) return this.props.children;

    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="w-full max-w-xl rounded-xl border border-border bg-background/60 p-5 space-y-3">
          <div className="text-sm font-semibold">Something went wrong</div>
          <div className="text-xs text-muted-foreground">
            The app hit a runtime error and stopped rendering. You can reload the page.
          </div>
          <pre className="text-[11px] whitespace-pre-wrap rounded-xl border border-border bg-muted/30 p-3 overflow-auto max-h-[260px]">
            {String(err?.message || err)}
          </pre>
          <button
            className="h-10 px-4 rounded-xl bg-accent text-accent-foreground text-sm font-semibold"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
