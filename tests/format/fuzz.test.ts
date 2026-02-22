import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { formatAdoc } from "../helpers.js";
import { adocDocument } from "../fuzz/arbitraries.js";
import { fuzzParameters } from "../fuzz/config.js";

describe("formatter fuzz", () => {
  // Property-based fuzz test for the formatter. Verifies that
  // formatting is idempotent: format(format(x)) === format(x).
  // Uses the AsciiDoc line-soup generator (tier 2) because
  // purely random strings rarely exercise the printer. See
  // docs/plans/2026-02-22-parser-fuzzing-design.md for design.
  test("formatting is idempotent on AsciiDoc line soup", async () => {
    await fc.assert(
      fc.asyncProperty(adocDocument, async (input) => {
        const first = await formatAdoc(input);
        const second = await formatAdoc(first);
        expect(second).toBe(first);
      }),
      fuzzParameters({ numRuns: 500 }),
    );
  });
});
