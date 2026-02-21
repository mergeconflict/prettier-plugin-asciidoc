import { describe, test, expect } from "vitest";
import { formatAdoc } from "../helpers.js";

describe("thematic break formatting", () => {
  // Basic thematic break preserved.
  test("basic thematic break preserved", async () => {
    const input = "'''\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  // Extended thematic break normalized to three quotes.
  test("extended thematic break normalized", async () => {
    expect(await formatAdoc("''''\n")).toBe("'''\n");
    expect(await formatAdoc("'''''\n")).toBe("'''\n");
  });

  // Thematic break with surrounding paragraphs has blank
  // line separation.
  test("thematic break between paragraphs", async () => {
    const input = "Before.\n\n'''\n\nAfter.\n";
    expect(await formatAdoc(input)).toBe(input);
  });
});

describe("page break formatting", () => {
  // Basic page break preserved.
  test("basic page break preserved", async () => {
    const input = "<<<\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  // Extended page break normalized to three less-than signs.
  test("extended page break normalized", async () => {
    expect(await formatAdoc("<<<<\n")).toBe("<<<\n");
    expect(await formatAdoc("<<<<<\n")).toBe("<<<\n");
  });

  // Page break with surrounding paragraphs has blank
  // line separation.
  test("page break between paragraphs", async () => {
    const input = "Before.\n\n<<<\n\nAfter.\n";
    expect(await formatAdoc(input)).toBe(input);
  });
});
