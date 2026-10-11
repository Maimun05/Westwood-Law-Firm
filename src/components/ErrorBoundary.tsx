// ============================================================================
// Error boundary
// ============================================================================
// React 19 still requires a class component for getDerivedStateFromError /
// componentDidCatch. Two instances are mounted:
//   - main.tsx, around <App/> — last resort if the shell itself throws.
//   - App.tsx, around the page switch, keyed by page — so Navigation and the
//     Footer survive a page crash and navigating away clears the error.
//
// A stale-chunk failure after a redeploy also lands here: the lazy() import
// rejects, and the fallback's Reload button fetches the new index.html.
// ============================================================================

import { Component, type ErrorInfo, type ReactNode } from "react";

import { captureException } from "@/lib/monitoring";

type Props = {
  children: ReactNode;
  fallback: (error: Error, reset: () => void) => ReactNode;
};

type State = { error: Error | null };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureException(error, { componentStack: info.componentStack ?? undefined });
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return this.props.fallback(this.state.error, this.reset);
    }

    return this.props.children;
  }
}
