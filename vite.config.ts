/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Vite config for Vercel deployment
export default defineConfig(({ mode }) => {
  const emitSourcemaps = mode === "development";

  return {
    base: "/",
    build: {
      sourcemap: emitSourcemaps ? "inline" : false,
      minify: !emitSourcemaps,
      outDir: "dist",
    },
    plugins: [react(), tailwindcss()],
    // Pure-logic suites only (routes, SEO map, content schema, fallback
    // semantics) — node environment, no DOM. The `@` alias and the dedupe
    // below are reused from this config, so tests resolve exactly like the app.
    test: {
      environment: "node",
      include: ["src/**/*.test.ts"],
      // The default "threads"/"forks" pools fail on Windows with vitest 5.0.3 +
      // vite 8.3.2: the test file's `import { describe } from "vitest"` resolves
      // to a second copy of vitest's runner module, whose module-level `runner`
      // is never initialised, so the first describe() dies with "Cannot read
      // properties of undefined (reading 'config')". A trivial one-line test
      // fails the same way, so it is the runner, not the suite. The VM pools
      // evaluate the file in a fresh vm context and are unaffected, and they
      // behave identically on Linux, so use one on every platform.
      pool: "vmThreads",
    },
    resolve: {
      // Without this, a rolldown bug (Vite 8 on Windows, seen through 8.3.2)
      // bundles React twice when the "@" alias is configured: react-dom and
      // main.tsx get one copy, every other module gets another, and the app
      // dies at boot with "Cannot read properties of null (reading 'useState')"
      // because the second copy's hook dispatcher is never set. Verified with
      // `npm run build` + a headless-browser smoke test — do not remove.
      dedupe: ["react", "react-dom"],
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
      strictPort: true,
    },
    preview: {
      host: "0.0.0.0",
      port: 4173,
    },
  };
});
