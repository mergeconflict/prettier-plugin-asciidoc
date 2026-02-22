import { defineConfig } from "vitest/config";

// Generous default so property-based tests with bounded
// run counts aren't killed prematurely.
const TEST_TIMEOUT = 60_000;

export default defineConfig({
  test: {
    exclude: ["node_modules/**"],
    passWithNoTests: true,
    testTimeout: TEST_TIMEOUT,
  },
});
