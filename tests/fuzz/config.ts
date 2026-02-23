/**
 * Shared fuzz-test configuration.
 *
 * Setting the FUZZ environment variable enables continuous fuzzing:
 * runs indefinitely until Ctrl-C or the first failure. Without it,
 * tests use the caller-supplied numRuns for CI and allow shrinking
 * (fast-check explores minimal counterexamples on failure).
 * See https://fast-check.dev/docs/advanced/fuzzing/
 */

import type { Parameters } from "fast-check";

// Check for presence, not value — `FUZZ=0` still enables fuzzing.
const FUZZING = process.env.FUZZ !== undefined;

/**
 * Adjusts fast-check parameters for the active run mode.
 *
 * In fuzzing mode (FUZZ env var set): overrides numRuns to
 * infinity and sets endOnFailure, skipping shrinking so the
 * run stops immediately on the first failure.
 *
 * In CI mode: preserves the caller's numRuns and clears
 * endOnFailure so fast-check can shrink counterexamples to
 * their minimal form.
 * @param parameters - fast-check parameters supplied by the
 *   caller; numRuns is used as the CI run count
 * @returns parameters with numRuns and endOnFailure set for
 *   the active mode
 */
export function fuzzParameters<T>(parameters: Parameters<T>): Parameters<T> {
  return {
    ...parameters,
    numRuns: FUZZING ? Number.POSITIVE_INFINITY : parameters.numRuns,
    endOnFailure: FUZZING,
  };
}
