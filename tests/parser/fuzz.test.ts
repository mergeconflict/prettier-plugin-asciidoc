import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { parse } from "../../src/parser.js";
import { randomInput, adocDocument } from "../fuzz/arbitraries.js";
import { numberOfRuns } from "../fuzz/config.js";

// Property-based fuzz tests for the parser. These complement
// the hand-written error recovery tests in error-recovery.test.ts
// by exploring the input space randomly. See
// docs/plans/2026-02-22-parser-fuzzing-design.md for design.

describe("parser fuzz", () => {
  test("tier 1: random input never throws", () => {
    fc.assert(
      fc.property(randomInput, (input) => {
        const result = parse(input);
        expect(result.type).toBe("document");
      }),
      { numRuns: numberOfRuns(1000) },
    );
  });

  test("tier 2: AsciiDoc line soup never throws", () => {
    fc.assert(
      fc.property(adocDocument, (input) => {
        const result = parse(input);
        expect(result.type).toBe("document");
      }),
      { numRuns: numberOfRuns(1000) },
    );
  });
});
