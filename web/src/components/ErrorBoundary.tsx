import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error?.message || 'Unexpected rendering error' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="mx-auto max-w-xl px-4 py-16 text-center">
          <div className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 shadow-xs">
            <h1 className="font-editorial text-2xl font-semibold text-[var(--ink-primary)]">
              Something went wrong
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-[var(--ink-secondary)]">
              If you were editing a map in Studio, your draft is auto-saved in this browser.
            </p>
            {this.state.message && (
              <p className="mt-2 rounded-lg bg-rose-50 px-3 py-1.5 font-mono-meta text-[11px] text-rose-700">
                {this.state.message}
              </p>
            )}
            <div className="mt-5 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, message: '' })}
                className="rounded-lg bg-[var(--ink-primary)] px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-lg border border-[var(--border-hairline)] px-4 py-2 text-xs font-semibold text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
              >
                Reload page
              </button>
            </div>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
