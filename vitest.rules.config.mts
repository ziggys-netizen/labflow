import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    pool: "forks",
    fileParallelism: false,
    include: ["app/lib/firestore.rules.test.ts"],
    testTimeout: 15_000,
  },
});
