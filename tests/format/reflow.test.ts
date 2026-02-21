/**
 * Paragraph reflow tests — verifies that prose text is wrapped to
 * printWidth using Prettier's fill command.
 *
 * Plain-text subset only. Inline markup and hard line break tests
 * will be added when those features land (Tasks 14-16).
 */
import { describe, test, expect } from "vitest";
import { formatAdoc } from "../helpers.js";

describe("paragraph reflow", () => {
  // A short paragraph that fits within printWidth should remain
  // on a single line — no wrapping needed.
  test("short paragraph stays on one line", async () => {
    const input = "Hello world.\n";
    expect(await formatAdoc(input)).toBe("Hello world.\n");
  });

  // A long paragraph exceeding printWidth should be wrapped.
  // Prettier's fill packs words greedily — "three four" (10 chars)
  // fits in printWidth=10, so they share a line.
  test("long paragraph wraps at printWidth", async () => {
    const input = "one two three four five six seven\n";
    const expected = "one two\nthree four\nfive six\nseven\n";
    expect(await formatAdoc(input, { printWidth: 10 })).toBe(expected);
  });

  // Multiple short words that fit on one line should stay together.
  test("multiple short words kept on one line", async () => {
    const input = "a b c d e\n";
    expect(await formatAdoc(input, { printWidth: 80 })).toBe("a b c d e\n");
  });

  // Existing line breaks within a paragraph are NOT preserved —
  // the formatter reflows text to fill each line optimally.
  test("existing line breaks are reflowed", async () => {
    const input = "Line one.\nLine two.\nLine three.\n";
    const expected = "Line one. Line two. Line three.\n";
    expect(await formatAdoc(input, { printWidth: 80 })).toBe(expected);
  });

  // Comment content must NOT be reflowed — it is verbatim.
  test("comment content is not reflowed", async () => {
    const input =
      "// This is a comment that should stay on one line\n";
    expect(await formatAdoc(input)).toBe(
      "// This is a comment that should stay on one line\n",
    );
  });

  // Block comment content must stay verbatim.
  test("block comment content is not reflowed", async () => {
    const input = "////\nShort line.\nAnother short line.\n////\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  // Formatting must be idempotent: formatting twice should
  // produce the same output as formatting once.
  test("reflow is idempotent", async () => {
    const input = "one two three four five six seven\n";
    const first = await formatAdoc(input, { printWidth: 10 });
    const second = await formatAdoc(first, { printWidth: 10 });
    expect(second).toBe(first);
  });

  // Reflow with a realistic printWidth: a paragraph that spans
  // well beyond 80 columns should be wrapped.
  test("wraps long prose at default printWidth", async () => {
    // Build a paragraph of ~120 characters.
    const words = Array.from(
      { length: 20 },
      (_, index) => `word${String(index)}`,
    );
    const input = `${words.join(" ")}\n`;
    const result = await formatAdoc(input, { printWidth: 40 });
    // Every output line (except possibly the last) should be
    // at most 40 characters.
    const lines = result.trimEnd().split("\n");
    for (const line of lines.slice(0, -1)) {
      expect(line.length).toBeLessThanOrEqual(40);
    }
    // And reflow is idempotent.
    expect(await formatAdoc(result, { printWidth: 40 })).toBe(result);
  });

  // Edge case: single word longer than printWidth — it can't be
  // broken, so it stays on its own line.
  test("single long word is not broken", async () => {
    const input = "supercalifragilisticexpialidocious\n";
    expect(await formatAdoc(input, { printWidth: 10 })).toBe(input);
  });

  // Multiple paragraphs should each be reflowed independently,
  // separated by blank lines.
  test("multiple paragraphs are reflowed independently", async () => {
    const input = "one two three four five\n\nsix seven eight nine ten\n";
    const expected =
      "one two\nthree four\nfive\n\nsix seven\neight nine\nten\n";
    expect(await formatAdoc(input, { printWidth: 10 })).toBe(expected);
  });

  // Tabs in paragraph text are treated as whitespace by the reflow
  // logic (`split(/\s+/)`). This guards against regressions where
  // tab-separated words might be collapsed incorrectly or left
  // un-split during reflow.
  test("tabs between words are treated as whitespace", async () => {
    const input = "one\ttwo\tthree\n";
    expect(await formatAdoc(input)).toBe("one two three\n");
  });

  // A paragraph containing only whitespace (spaces and tabs) should
  // collapse to nothing after reflow since `split(/\s+/)` produces
  // only empty strings from whitespace-only input. Prettier treats
  // this as empty content and returns an empty string.
  test("whitespace-only paragraph produces empty output", async () => {
    const input = "   \t  \n";
    const result = await formatAdoc(input);
    expect(result).toBe("");
  });
});
