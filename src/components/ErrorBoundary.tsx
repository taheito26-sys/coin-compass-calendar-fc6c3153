import React from "react";

interface Props {
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Generic error boundary — catches render errors and shows a fallback
 * instead of white-screening the entire app.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          style={{
            padding: 32,
            textAlign: "center",
            color: "var(--muted, #a1a1aa)",
            fontFamily: "Inter, system-ui, sans-serif",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: "var(--text, #fff)" }}>
            Something went wrong
          </div>
          <div style={{ fontSize: 13, marginBottom: 16 }}>
            {this.state.error?.message || "An unexpected error occurred."}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: "6px 16px",
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid var(--line, #333)",
              background: "var(--panel, #1a1a1a)",
              color: "var(--text, #fff)",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Page-level error boundary with a styled fallback.
 */
export function PageErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary
      fallback={
        <div
          style={{
            padding: 48,
            textAlign: "center",
            color: "var(--muted, #a1a1aa)",
            fontFamily: "Inter, system-ui, sans-serif",
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: "var(--text, #fff)" }}>
            Page failed to load
          </div>
          <div style={{ fontSize: 13 }}>
            This page encountered an error. Try navigating to another page.
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}
