import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { formatAdoc } from "../helpers.js";
import { adocDocument } from "../fuzz/arbitraries.js";
import { numberOfRuns } from "../fuzz/config.js";

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
      {
        numRuns: numberOfRuns(500),
        examples: [
          // Regression: makeClosePattern's regex used to match
          // a close delimiter as a prefix of a content line.
          // `....x` inside a `....`-delimited literal block
          // would match `....` as a close delimiter, leaving
          // `x` as stray text in default mode. Fixed by adding
          // (?![^\n]) to the close pattern regex so it only
          // matches when the delimiter occupies the full line.
          [".....\n....x\n"],

          // Regression: a whitespace-only first line was tokenized
          // as TextContent and became a paragraph. The printer
          // rendered it as empty content plus a blank-line separator,
          // producing spurious leading newlines that the second
          // format pass stripped — breaking idempotency. Fixed by
          // requiring at least one non-whitespace character in the
          // TextContent token pattern.
          [" \n. item"],

          // Regression: admonition paragraph wrapping.
          // The printer used align() to indent continuation lines
          // under the admonition label (e.g. "NOTE: "), but leading
          // spaces in AsciiDoc denote an indented literal block.
          // On re-parse the continuation is a literal block, not
          // paragraph text, so the second format pass differs.
          [`NOTE: ${"word ".repeat(20)}`],
        ],
      },
    );
  });
});
