import { describe, test, expect } from "vitest";
import { formatAdoc } from "../helpers.js";

describe("example block formatting", () => {
  // Canonical example block passes through unchanged.
  test("basic example block preserved", async () => {
    const input = "====\nSome content.\n====\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  // Empty example block preserved.
  test("empty example block preserved", async () => {
    const input = "====\n====\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  // Extended example delimiters are normalized to 4 characters.
  test("delimiter length normalized to 4", async () => {
    const input = "======\nContent.\n======\n";
    const expected = "====\nContent.\n====\n";
    expect(await formatAdoc(input)).toBe(expected);
  });

  // Multiple inner paragraphs separated by blank lines.
  test("multiple inner paragraphs", async () => {
    const input =
      "====\nFirst paragraph.\n\nSecond paragraph.\n====\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  // Example block between paragraphs.
  test("between paragraphs", async () => {
    const input =
      "Before.\n\n====\nInside.\n====\n\nAfter.\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  // Inner paragraph text is reflowed.
  test("inner paragraph text is reflowed", async () => {
    const input =
      "====\nThis is a long sentence that should be reflowed by the formatter.\n====\n";
    const result = await formatAdoc(input, { printWidth: 40 });
    // Should be reflowed within the delimiters.
    expect(result).toContain("====\n");
    // The content should be split across multiple lines.
    const lines = result.split("\n");
    // At least 4 lines: delimiter, 2+ content lines, delimiter, trailing newline.
    expect(lines.length).toBeGreaterThanOrEqual(5);
  });
});

describe("sidebar block formatting", () => {
  // Canonical sidebar block passes through unchanged.
  test("basic sidebar block preserved", async () => {
    const input = "****\nSidebar content.\n****\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  // Empty sidebar block preserved.
  test("empty sidebar block preserved", async () => {
    const input = "****\n****\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  // Extended sidebar delimiters normalized to 4.
  test("delimiter length normalized to 4", async () => {
    const input = "******\nContent.\n******\n";
    const expected = "****\nContent.\n****\n";
    expect(await formatAdoc(input)).toBe(expected);
  });

  // Multiple inner paragraphs preserved.
  test("multiple inner paragraphs", async () => {
    const input = "****\nFirst.\n\nSecond.\n****\n";
    expect(await formatAdoc(input)).toBe(input);
  });
});

describe("open block formatting", () => {
  // Canonical open block passes through unchanged.
  test("basic open block preserved", async () => {
    const input = "--\nOpen content.\n--\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  // Empty open block preserved.
  test("empty open block preserved", async () => {
    const input = "--\n--\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  // Open block delimiter is always exactly `--` (2 dashes).
  test("open block always uses 2 dashes", async () => {
    const input = "--\nContent.\n--\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  // Multiple inner paragraphs preserved.
  test("multiple inner paragraphs", async () => {
    const input = "--\nFirst.\n\nSecond.\n--\n";
    expect(await formatAdoc(input)).toBe(input);
  });
});

describe("quote block formatting", () => {
  // Canonical quote block passes through unchanged.
  test("basic quote block preserved", async () => {
    const input = "____\nQuoted text.\n____\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  // Empty quote block preserved.
  test("empty quote block preserved", async () => {
    const input = "____\n____\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  // Extended quote delimiters normalized to 4.
  test("delimiter length normalized to 4", async () => {
    const input = "______\nText.\n______\n";
    const expected = "____\nText.\n____\n";
    expect(await formatAdoc(input)).toBe(expected);
  });

  // Multiple inner paragraphs preserved.
  test("multiple inner paragraphs", async () => {
    const input = "____\nFirst.\n\nSecond.\n____\n";
    expect(await formatAdoc(input)).toBe(input);
  });
});

describe("nested parent block formatting", () => {
  // Example inside sidebar — no blank lines between delimiter
  // and content; the delimiter is framing, not a block separator.
  test("example inside sidebar", async () => {
    const input =
      "****\n====\nNested content.\n====\n****\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  // Listing block (leaf) inside example block.
  test("leaf block inside parent block", async () => {
    const input =
      "====\n----\ncode\n----\n====\n";
    expect(await formatAdoc(input)).toBe(input);
  });
});
