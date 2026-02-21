/**
 * Parser tests for the AsciiDoc document title and header.
 *
 * The document title uses `= Title` (single `=` marker) — distinct
 * from section headings which use `==` through `======`. The header
 * is the document title plus any contiguous attribute entries (no
 * blank lines between them).
 */
import { describe, test, expect } from "vitest";
import { parse } from "../../src/parser.js";

describe("document title parsing", () => {
  // The document title is a level-0 heading using a single `=` marker.
  // It should parse as its own node type, separate from section headings.
  test("= Title parses as documentTitle", () => {
    const document = parse("= My Document\n");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("documentTitle");
    if (document.children[0].type === "documentTitle") {
      expect(document.children[0].title).toBe("My Document");
    }
  });

  // Extra whitespace between the `=` marker and the title text should
  // be normalized during parsing, just like section headings.
  test("extra whitespace in title is trimmed", () => {
    const document = parse("=  Extra Spaces  \n");
    expect(document.children).toHaveLength(1);
    if (document.children[0].type === "documentTitle") {
      expect(document.children[0].title).toBe("Extra Spaces");
    }
  });

  // Position tracking: the document title starts at offset 0, line 1,
  // column 1. Important for Prettier's locStart/locEnd.
  test("document title has correct position", () => {
    const document = parse("= Title\n");
    const {
      children: [title],
    } = document;
    expect(title.position.start.offset).toBe(0);
    expect(title.position.start.line).toBe(1);
    expect(title.position.start.column).toBe(1);
  });

  // The document title followed by attribute entries (no blank line)
  // is the standard header pattern. Both should be parsed as separate
  // block nodes — grouping is handled by the printer's join logic.
  test("document title followed by attribute entries", () => {
    const input = "= My Document\n:toc:\n:source-highlighter: rouge\n";
    const document = parse(input);
    expect(document.children).toHaveLength(3);
    expect(document.children[0].type).toBe("documentTitle");
    expect(document.children[1].type).toBe("attributeEntry");
    expect(document.children[2].type).toBe("attributeEntry");
  });

  // A blank line after the title separates the header from the body.
  // The body paragraph should be a sibling, not grouped under the title.
  test("blank line after title separates header from body", () => {
    const input = "= My Document\n\nBody text.\n";
    const document = parse(input);
    expect(document.children).toHaveLength(2);
    expect(document.children[0].type).toBe("documentTitle");
    expect(document.children[1].type).toBe("paragraph");
  });

  // Document title with attribute entries, then a blank line, then body.
  // The attribute entries belong to the header (contiguous with title),
  // and the paragraph starts the body.
  test("full header with attributes then body", () => {
    const input = "= My Document\n:toc:\n\nBody text.\n";
    const document = parse(input);
    expect(document.children).toHaveLength(3);
    expect(document.children[0].type).toBe("documentTitle");
    expect(document.children[1].type).toBe("attributeEntry");
    expect(document.children[2].type).toBe("paragraph");
  });

  // The document title must not be confused with section headings.
  // `== Title` is a section (level 1), not a document title.
  test("== is a section, not a document title", () => {
    const document = parse("== Section\n");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("section");
  });

  // Document title followed by a section heading. The section is not
  // a child of the title — both are top-level blocks.
  test("document title followed by section", () => {
    const input = "= My Document\n\n== First Section\n";
    const document = parse(input);
    expect(document.children).toHaveLength(2);
    expect(document.children[0].type).toBe("documentTitle");
    expect(document.children[1].type).toBe("section");
  });

  // A document title at EOF without a trailing newline exercises the
  // grammar's tolerance for missing trailing whitespace. The lexer
  // regex `/= [^\n]+/` matches to end of input, and the grammar's
  // MANY loop terminates without a trailing Newline token.
  test("document title at EOF without trailing newline", () => {
    const document = parse("= Title");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("documentTitle");
    if (document.children[0].type === "documentTitle") {
      expect(document.children[0].title).toBe("Title");
    }
  });

  // The token pattern `/= [^\n]+/` matches `= ` followed by any
  // non-newline characters — including spaces. When the title is
  // only whitespace, `slice(2).trim()` produces an empty string.
  // This documents the parser's behavior for this degenerate input.
  test("= followed by only whitespace produces empty title", () => {
    const document = parse("=  \n");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("documentTitle");
    if (document.children[0].type === "documentTitle") {
      expect(document.children[0].title).toBe("");
    }
  });
});
