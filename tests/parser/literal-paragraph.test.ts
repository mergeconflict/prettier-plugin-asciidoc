import { describe, test, expect } from "vitest";
import { parse } from "../../src/parser.js";
import { firstDelimitedBlock } from "../helpers.js";

// Tests for the indented form of literal blocks (one or more lines
// beginning with a space) and — as a contrast case — the delimited
// `....` form. The paragraph form (`[literal]` + plain paragraph) is
// covered in tests/parser/paragraph-form-blocks.test.ts.
describe("literal paragraph parsing", () => {
  // A single line beginning with a space is recognised as a literal
  // paragraph (form: "indented"). The leading space is part of the
  // content — indentation is semantically significant in literal
  // blocks and must be preserved verbatim.
  test("single indented line", () => {
    const { children } = parse(" indented text\n");
    expect(children).toHaveLength(1);
    const block = firstDelimitedBlock(children);
    expect(block.variant).toBe("literal");
    expect(block.form).toBe("indented");
    expect(block.content).toBe(" indented text");
  });

  // Multiple consecutive indented lines form a single literal block.
  // They are joined by the absence of a blank line between them —
  // the same rule that merges regular paragraph lines. Each line's
  // indentation is preserved verbatim in the content string.
  test("multiple consecutive indented lines", () => {
    const { children } = parse(" line one\n line two\n line three\n");
    expect(children).toHaveLength(1);
    const block = firstDelimitedBlock(children);
    expect(block.variant).toBe("literal");
    expect(block.form).toBe("indented");
    expect(block.content).toBe(" line one\n line two\n line three");
  });

  // A blank line terminates the literal block. Text after the blank
  // line is not indented, so it parses as a regular paragraph —
  // verifying that the block boundary is correct and the two nodes
  // are independent siblings.
  test("blank line ends literal paragraph", () => {
    const { children } = parse(" indented\n\nregular paragraph\n");
    expect(children).toHaveLength(2);
    expect(children[0].type).toBe("delimitedBlock");
    expect(children[1].type).toBe("paragraph");
    const block = firstDelimitedBlock(children);
    expect(block.content).toBe(" indented");
  });

  // Indentation depth varies line-to-line: 2 spaces, 4 spaces, then
  // 1 space. All three lines still belong to the same block (no blank
  // lines separate them), and each line's exact leading whitespace is
  // preserved — even the minimum-indent line (1 space) is not stripped.
  test("varying indentation preserved", () => {
    const { children } = parse("  two spaces\n    four spaces\n one space\n");
    expect(children).toHaveLength(1);
    const block = firstDelimitedBlock(children);
    expect(block.content).toBe("  two spaces\n    four spaces\n one space");
  });

  // A literal block surrounded by regular paragraphs. Both blank-line
  // boundaries are respected: the first blank line closes the opening
  // paragraph, the second closes the literal block. All three nodes
  // are independent siblings in the document children array.
  test("between regular paragraphs", () => {
    const { children } = parse("Before.\n\n  indented\n\nAfter.\n");
    expect(children).toHaveLength(3);
    expect(children[0].type).toBe("paragraph");
    expect(children[1].type).toBe("delimitedBlock");
    expect(children[2].type).toBe("paragraph");
  });

  // The literal block node's start position covers the leading space:
  // line 1, column 1, offset 0. Column is 1-based and is NOT 2 even
  // though the content begins with a space — the position represents
  // the start of the block in the source, not the first non-space
  // character.
  test("position tracking", () => {
    const { children } = parse(" indented text\n");
    const block = firstDelimitedBlock(children);
    expect(block.position.start.line).toBe(1);
    expect(block.position.start.column).toBe(1);
    expect(block.position.start.offset).toBe(0);
  });

  // A `....` delimited block produces variant "literal" with
  // form "delimited" — distinguishing it from an indented literal
  // paragraph (form "indented") and a paragraph-form literal
  // ([literal] + paragraph, form "paragraph"). The three forms share
  // the same variant but differ in how the content was expressed in
  // source, which the printer uses to decide how to reformat.
  test("delimited literal block has form delimited", () => {
    const { children } = parse("....\nsome text\n....\n");
    const block = firstDelimitedBlock(children);
    expect(block.variant).toBe("literal");
    expect(block.form).toBe("delimited");
  });
});
