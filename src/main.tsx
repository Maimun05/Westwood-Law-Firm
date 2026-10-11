import React from "react";

import ReactDOM from "react-dom/client";

import App from "./App";

import ErrorBoundary from "./components/ErrorBoundary";

import ErrorFallback from "./components/ErrorFallback";

import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary fallback={(error) => <ErrorFallback error={error} />}>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
