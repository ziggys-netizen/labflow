import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

// Next 16 documents Vitest + jsdom for React components
// (node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md).
// S4 tests are pure TypeScript — node avoids Windows jsdom fork timeouts.
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "node",
    pool: "threads",
    include: ["app/**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", "app/lib/firestore.rules.test.ts"],
  },
});
