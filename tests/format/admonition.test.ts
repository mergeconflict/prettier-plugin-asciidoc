/**
 * Format tests for admonition blocks.
 *
 * Tests both paragraph-form (`NOTE: text`) and block-form
 * (`[NOTE]\n====\n...\n====`) admonitions. Paragraph-form
 * admonitions reflow text to printWidth with hanging indent.
 * Block-form admonitions preserve their delimiter structure.
 */
import { describe, test, expect } from "vitest";
import { formatAdoc } from "../helpers.js";

describe("paragraph-form admonition formatting", () => {
  test("NOTE: text round-trips", async () => {
    const input = "NOTE: This is a note.\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  test("TIP: text round-trips", async () => {
    const input = "TIP: Here is a tip.\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  test("IMPORTANT: text round-trips", async () => {
    const input = "IMPORTANT: Do not forget.\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  test("CAUTION: text round-trips", async () => {
    const input = "CAUTION: Watch out.\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  test("WARNING: text round-trips", async () => {
    const input = "WARNING: Be careful.\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  test("long text reflows to printWidth", async () => {
    const input =
      "NOTE: This is a very long note that should be reflowed when it exceeds the print width boundary.\n";
    const expected =
      "NOTE: This is a very long note that should be reflowed when it exceeds the print\nwidth boundary.\n";
    expect(await formatAdoc(input)).toBe(expected);
  });

  test("continuation lines start at column 0", async () => {
    // Leading spaces in AsciiDoc denote an indented literal
    // block, so continuation lines must start at column 0.
    const input =
      "WARNING: First word second word third word fourth word fifth word sixth word.\n";
    const result = await formatAdoc(input, { printWidth: 40 });
    const lines = result.trimEnd().split("\n");
    expect(lines.length).toBeGreaterThan(1);
    for (const continuationLine of lines.slice(1)) {
      expect(continuationLine).toMatch(/^\S/v);
    }
  });

  test("multi-line paragraph-form text is reflowed", async () => {
    const input = "NOTE: First line\nsecond line\nthird line\n";
    const expected = "NOTE: First line second line third line\n";
    expect(await formatAdoc(input)).toBe(expected);
  });

  // Paragraph-form admonition reflow must not place a .word at
  // line start where it would become a block title.
  test("admonition reflow does not create block title", async () => {
    const input = "NOTE: aaa bbb .title\n";
    const result = await formatAdoc(input, { printWidth: 16 });
    for (const line of result.split("\n")) {
      expect(line).not.toMatch(/^\.[A-Za-z]/v);
    }
  });
});

describe("block-form admonition formatting (example block)", () => {
  test("[NOTE] + example block round-trips", async () => {
    const input = "[NOTE]\n====\nContent.\n====\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  test("[TIP] + example block round-trips", async () => {
    const input = "[TIP]\n====\nA tip.\n====\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  test("[IMPORTANT] + example block round-trips", async () => {
    const input = "[IMPORTANT]\n====\nDo not forget.\n====\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  test("[CAUTION] + example block round-trips", async () => {
    const input = "[CAUTION]\n====\nWatch out.\n====\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  test("[WARNING] + example block round-trips", async () => {
    const input = "[WARNING]\n====\nBe careful.\n====\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  test("block-form with multiple paragraphs round-trips", async () => {
    const input = "[NOTE]\n====\nFirst paragraph.\n\nSecond paragraph.\n====\n";
    expect(await formatAdoc(input)).toBe(input);
  });
});

describe("block-form admonition formatting (open block)", () => {
  test("[CAUTION] + open block round-trips", async () => {
    const input = "[CAUTION]\n--\nContent.\n--\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  test("[NOTE] + open block round-trips", async () => {
    const input = "[NOTE]\n--\nA note in an open block.\n--\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  test("open block with multiple paragraphs round-trips", async () => {
    const input = "[WARNING]\n--\nFirst.\n\nSecond.\n--\n";
    expect(await formatAdoc(input)).toBe(input);
  });
});

describe("admonition formatting in context", () => {
  test("paragraph-form admonition between paragraphs", async () => {
    const input = "Before.\n\nNOTE: A note.\n\nAfter.\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  test("block-form admonition between paragraphs", async () => {
    const input = "Before.\n\n[NOTE]\n====\nA note.\n====\n\nAfter.\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  test("block title + block-form admonition stacks", async () => {
    const input = ".My Note\n[NOTE]\n====\nContent.\n====\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  test("anchor + block-form admonition stacks", async () => {
    const input = "[[my-note]]\n[TIP]\n====\nContent.\n====\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  // Block title stacks with paragraph-form admonition.
  test("block title + paragraph-form admonition", async () => {
    const input = ".My Note\nNOTE: This is a note.\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  // Anchor stacks with paragraph-form admonition.
  test("anchor + paragraph-form admonition", async () => {
    const input = "[[my-note]]\nNOTE: This is a note.\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  // Custom admonition type round-trips.
  test("custom admonition [EXERCISE] round-trips", async () => {
    const input = "[EXERCISE]\n====\nDo this exercise.\n====\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  // Regression: a delimited admonition wrapping a same-variant
  // parent block must use a longer delimiter to preserve nesting.
  // Without this, both delimiters normalize to `****`, collapsing
  // the nesting on re-parse.
  test("admonition delimiter longer than nested same-variant block", async () => {
    const input = "[M]\n\n******\n****\n//////\n///////\n//////";
    expect(await formatAdoc(input)).toBe(
      "[M]\n*****\n****\n////\n////\n\n////\n////\n****\n*****\n",
    );
  });
});
