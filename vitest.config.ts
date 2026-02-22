import { defineConfig } from "vitest/config";

// setTimeout uses a 32-bit signed integer internally,
// so this is the largest usable timeout value.
const MAX_TIMEOUT = 2_147_483_647;

// Generous default so fuzz tests (which use fast-check's
// interruptAfterTimeLimit for their own time bounds) aren't
// killed by vitest.
const CI_TIMEOUT = 60_000;

export default defineConfig({
  test: {
    exclude: ["node_modules/**"],
    passWithNoTests: true,
    // FUZZ disables the timeout entirely.
    testTimeout: process.env.FUZZ === undefined ? CI_TIMEOUT : MAX_TIMEOUT,
  },
});
