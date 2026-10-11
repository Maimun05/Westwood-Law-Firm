import React from "react";

import ReactDOM from "react-dom/client";

import { inject } from "@vercel/analytics";

import App from "./App";

import ErrorBoundary from "./components/ErrorBoundary";

import ErrorFallback from "./components/ErrorFallback";

import { initMonitoring } from "./lib/monitoring";

import "./index.css";

// Wire the observability sinks before the app renders. initMonitoring is a
// no-op unless VITE_SENTRY_DSN is configured (and loads the SDK on demand);
// inject() is Vercel Web Analytics, a no-op outside Vercel deployments.

initMonitoring();

inject();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary fallback={(error) => <ErrorFallback error={error} />}>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
