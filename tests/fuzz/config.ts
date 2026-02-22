/**
 * Shared fuzz-test configuration.
 *
 * Setting FUZZ enables continuous fuzzing (runs until Ctrl-C or
 * failure). Without it, tests use bounded settings for CI.
 * See https://fast-check.dev/docs/advanced/fuzzing/
 */

import type { Parameters } from "fast-check";

const FUZZING = process.env.FUZZ !== undefined;

// Infinite runs + stop-on-failure when fuzzing,
// caller-specified run count for CI.
export function fuzzParameters<T>(parameters: Parameters<T>): Parameters<T> {
  return {
    ...parameters,
    numRuns: FUZZING ? Number.POSITIVE_INFINITY : parameters.numRuns,
    endOnFailure: FUZZING,
  };
}
