import { describe, test, expect } from "vitest";
import { formatAdoc } from "../helpers.js";

describe("literal paragraph formatting", () => {
  // Single indented line preserved verbatim.
  test("single indented line preserved", async () => {
    const input = " indented text\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  // Multiple indented lines preserved with their indentation.
  test("multiple indented lines preserved", async () => {
    const input = " line one\n line two\n line three\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  // Varying indentation preserved exactly.
  test("varying indentation preserved", async () => {
    const input = "  two spaces\n    four spaces\n one space\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  // Blank line separation between paragraph and literal paragraph.
  test("blank line between paragraph and literal paragraph", async () => {
    const input = "Some text.\n\n indented code\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  // Blank line separation between literal paragraph and paragraph.
  test("blank line between literal paragraph and paragraph", async () => {
    const input = " indented code\n\nSome text.\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  // Literal paragraph between two regular paragraphs.
  test("between paragraphs", async () => {
    const input = "Before.\n\n  indented code\n  more code\n\nAfter.\n";
    expect(await formatAdoc(input)).toBe(input);
  });
});
