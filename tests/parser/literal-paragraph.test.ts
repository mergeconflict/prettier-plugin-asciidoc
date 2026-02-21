import { describe, test, expect } from "vitest";
import { parse } from "../../src/parser.js";
import type { DelimitedBlockNode } from "../../src/ast.js";

// Helper to extract the first delimited block from parsed children.
function firstDelimitedBlock(
  children: ReturnType<typeof parse>["children"],
): DelimitedBlockNode {
  const [block] = children;
  if (block.type !== "delimitedBlock") {
    throw new Error(`Expected delimitedBlock, got ${block.type}`);
  }
  return block;
}

describe("literal paragraph parsing", () => {
  // A single line indented by one space becomes a literal paragraph.
  test("single indented line", () => {
    const { children } = parse(" indented text\n");
    expect(children).toHaveLength(1);
    const block = firstDelimitedBlock(children);
    expect(block.variant).toBe("literal");
    expect(block.form).toBe("indented");
    expect(block.content).toBe(" indented text");
  });

  // Multiple consecutive indented lines form a single literal
  // paragraph. Each line's indentation is preserved.
  test("multiple consecutive indented lines", () => {
    const { children } = parse(
      " line one\n line two\n line three\n",
    );
    expect(children).toHaveLength(1);
    const block = firstDelimitedBlock(children);
    expect(block.variant).toBe("literal");
    expect(block.form).toBe("indented");
    expect(block.content).toBe(
      " line one\n line two\n line three",
    );
  });

  // A blank line ends the literal paragraph — subsequent
  // non-indented text becomes a regular paragraph.
  test("blank line ends literal paragraph", () => {
    const { children } = parse(
      " indented\n\nregular paragraph\n",
    );
    expect(children).toHaveLength(2);
    expect(children[0].type).toBe("delimitedBlock");
    expect(children[1].type).toBe("paragraph");
    const block = firstDelimitedBlock(children);
    expect(block.content).toBe(" indented");
  });

  // Varying indentation depths within one literal paragraph
  // are preserved.
  test("varying indentation preserved", () => {
    const { children } = parse(
      "  two spaces\n    four spaces\n one space\n",
    );
    expect(children).toHaveLength(1);
    const block = firstDelimitedBlock(children);
    expect(block.content).toBe(
      "  two spaces\n    four spaces\n one space",
    );
  });

  // A literal paragraph between two regular paragraphs.
  test("between regular paragraphs", () => {
    const { children } = parse(
      "Before.\n\n  indented\n\nAfter.\n",
    );
    expect(children).toHaveLength(3);
    expect(children[0].type).toBe("paragraph");
    expect(children[1].type).toBe("delimitedBlock");
    expect(children[2].type).toBe("paragraph");
  });

  // Position tracking: the literal paragraph node reports
  // correct start position.
  test("position tracking", () => {
    const { children } = parse(" indented text\n");
    const block = firstDelimitedBlock(children);
    expect(block.position.start.line).toBe(1);
    expect(block.position.start.column).toBe(1);
    expect(block.position.start.offset).toBe(0);
  });

  // Delimited literal blocks retain form: "delimited".
  test("delimited literal block has form delimited", () => {
    const { children } = parse("....\nsome text\n....\n");
    const block = firstDelimitedBlock(children);
    expect(block.variant).toBe("literal");
    expect(block.form).toBe("delimited");
  });
});
