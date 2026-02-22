/**
 * Format tests for paragraph-form blocks.
 *
 * Paragraph-form blocks are blocks expressed as an attribute list
 * followed by paragraph content (no delimiters). The formatter
 * preserves them without adding delimiters.
 */
import { describe, test, expect } from "vitest";
import { formatAdoc } from "../helpers.js";

describe("paragraph-form source block formatting", () => {
  // Canonical form: [source] + content preserved as-is.
  test("[source] + content preserved", async () => {
    const input = "[source]\nputs 'hello'\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  // [source,ruby] with language — attribute list + content.
  test("[source,ruby] + content preserved", async () => {
    const input = "[source,ruby]\nputs 'hello'\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  // Multi-line source content preserved verbatim.
  test("multi-line source content preserved", async () => {
    const input = "[source]\nline 1\nline 2\nline 3\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  // [listing] paragraph form.
  test("[listing] + content preserved", async () => {
    const input = "[listing]\nsome listing content\n";
    expect(await formatAdoc(input)).toBe(input);
  });
});

describe("paragraph-form literal block formatting", () => {
  // [literal] + content preserved.
  test("[literal] + content preserved", async () => {
    const input = "[literal]\nsome literal text\n";
    expect(await formatAdoc(input)).toBe(input);
  });
});

describe("paragraph-form pass block formatting", () => {
  // [pass] + content preserved.
  test("[pass] + content preserved", async () => {
    const input = "[pass]\n<div>raw html</div>\n";
    expect(await formatAdoc(input)).toBe(input);
  });
});

describe("paragraph-form verse block formatting", () => {
  // [verse] + content — line breaks preserved.
  test("[verse] + content with line breaks preserved", async () => {
    const input = "[verse]\nRoses are red,\nViolets are blue.\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  // [verse] with attribution.
  test("[verse, Author, Source] preserved", async () => {
    const input =
      "[verse, Robert Frost, Fire and Ice]\nSome say the world will end in fire,\nSome say in ice.\n";
    expect(await formatAdoc(input)).toBe(input);
  });
});

describe("paragraph-form quote block formatting", () => {
  // [quote] + content preserved.
  test("[quote] + content preserved", async () => {
    const input = "[quote]\nTo be or not to be.\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  // [quote] with attribution.
  test("[quote, Author, Source] preserved", async () => {
    const input = "[quote, Shakespeare, Hamlet]\nTo be or not to be.\n";
    expect(await formatAdoc(input)).toBe(input);
  });
});

describe("paragraph-form example block formatting", () => {
  // [example] + content preserved.
  test("[example] + content preserved", async () => {
    const input = "[example]\nThis is an example.\n";
    expect(await formatAdoc(input)).toBe(input);
  });
});

describe("paragraph-form sidebar block formatting", () => {
  // [sidebar] + content preserved.
  test("[sidebar] + content preserved", async () => {
    const input = "[sidebar]\nThis is sidebar content.\n";
    expect(await formatAdoc(input)).toBe(input);
  });
});

describe("paragraph-form block context formatting", () => {
  // Paragraph-form block between paragraphs gets blank line
  // separation.
  test("between paragraphs", async () => {
    const input = "Before.\n\n[source]\nsome code\n\nAfter.\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  // Block metadata stacks with paragraph-form block.
  test("block title stacks with paragraph-form block", async () => {
    const input = ".My Code\n[source]\nsome code\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  // Anchor + attribute list + paragraph-form block.
  test("anchor + [source] + content stacks", async () => {
    const input = "[[my-id]]\n[source]\nsome code\n";
    expect(await formatAdoc(input)).toBe(input);
  });

  // Blank line between metadata and paragraph-form block
  // is removed.
  test("blank line between attr list and content is removed", async () => {
    const input = "[source,ruby]\n\nputs 'hello'\n";
    const expected = "[source,ruby]\nputs 'hello'\n";
    expect(await formatAdoc(input)).toBe(expected);
  });

  // Non-style attribute lists still stack normally.
  test("[#myid] before paragraph remains separate", async () => {
    const input = "[#myid]\nSome text.\n";
    expect(await formatAdoc(input)).toBe(input);
  });
});
