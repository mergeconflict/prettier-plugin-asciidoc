/**
 * Shared fuzz-test configuration.
 *
 * Setting FUZZ enables continuous fuzzing (runs until Ctrl-C or
 * failure). Without it, tests use bounded settings for CI.
 * See https://fast-check.dev/docs/advanced/fuzzing/
 */

// Infinite runs when fuzzing, caller-specified default for CI.
export function numberOfRuns(ciDefault: number): number {
  return process.env.FUZZ === undefined ? ciDefault : Number.POSITIVE_INFINITY;
}
