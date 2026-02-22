/**
 * Parser tests for admonition blocks.
 *
 * AsciiDoc has five admonition types: NOTE, TIP, IMPORTANT,
 * CAUTION, WARNING. They appear in two forms:
 *
 * **Paragraph form** — a label prefix on a paragraph:
 *   `NOTE: This is a note.`
 *
 * **Block form** — an attribute list on a parent block:
 *   `[NOTE]\n====\nContent.\n====`
 *
 * Paragraph-form admonitions produce `AdmonitionNode` directly
 * from the grammar. Block-form admonitions are recognized by
 * the post-parse `convertParagraphFormBlocks` transform, which
 * converts `BlockAttributeList + ParentBlock` pairs to
 * `AdmonitionNode` with `form: "delimited"`.
 */
import { describe, test, expect } from "vitest";
import { parse } from "../../src/parser.js";
import type { AdmonitionNode } from "../../src/ast.js";

// Helper to extract the admonition node at a given index.
function admonitionAt(
  children: ReturnType<typeof parse>["children"],
  index: number,
): AdmonitionNode {
  const { [index]: block } = children;
  if (block.type !== "admonition") {
    throw new Error(
      `Expected admonition at index ${String(index)}, got ${block.type}`,
    );
  }
  return block;
}

describe("paragraph-form admonitions", () => {
  test("NOTE: produces admonition with variant note", () => {
    const { children } = parse("NOTE: This is a note.\n");
    expect(children).toHaveLength(1);
    const node = admonitionAt(children, 0);
    expect(node.variant).toBe("note");
    expect(node.form).toBe("paragraph");
    expect(node.content).toBe("This is a note.");
    expect(node.children).toHaveLength(0);
    expect(node.delimiter).toBeUndefined();
  });

  test("TIP: produces admonition with variant tip", () => {
    const { children } = parse("TIP: Here is a tip.\n");
    const node = admonitionAt(children, 0);
    expect(node.variant).toBe("tip");
    expect(node.form).toBe("paragraph");
    expect(node.content).toBe("Here is a tip.");
  });

  test("IMPORTANT: produces admonition with variant important", () => {
    const { children } = parse("IMPORTANT: Do not forget.\n");
    const node = admonitionAt(children, 0);
    expect(node.variant).toBe("important");
    expect(node.form).toBe("paragraph");
    expect(node.content).toBe("Do not forget.");
  });

  test("CAUTION: produces admonition with variant caution", () => {
    const { children } = parse("CAUTION: Watch out.\n");
    const node = admonitionAt(children, 0);
    expect(node.variant).toBe("caution");
    expect(node.form).toBe("paragraph");
    expect(node.content).toBe("Watch out.");
  });

  test("WARNING: produces admonition with variant warning", () => {
    const { children } = parse("WARNING: Be careful.\n");
    const node = admonitionAt(children, 0);
    expect(node.variant).toBe("warning");
    expect(node.form).toBe("paragraph");
    expect(node.content).toBe("Be careful.");
  });

  test("multi-line paragraph-form admonition", () => {
    const { children } = parse("NOTE: First line\nsecond line\nthird line\n");
    expect(children).toHaveLength(1);
    const node = admonitionAt(children, 0);
    expect(node.variant).toBe("note");
    expect(node.content).toBe("First line\nsecond line\nthird line");
  });

  test("position tracking for paragraph-form admonition", () => {
    const { children } = parse("NOTE: Hello.\n");
    const node = admonitionAt(children, 0);
    expect(node.position.start.line).toBe(1);
    expect(node.position.start.column).toBe(1);
    expect(node.position.start.offset).toBe(0);
  });

  test("paragraph-form admonition between paragraphs", () => {
    const { children } = parse("Before.\n\nNOTE: A note.\n\nAfter.\n");
    expect(children).toHaveLength(3);
    expect(children[0].type).toBe("paragraph");
    expect(children[1].type).toBe("admonition");
    expect(children[2].type).toBe("paragraph");
  });
});

describe("block-form admonitions (example block)", () => {
  test("[NOTE] + example block produces delimited admonition", () => {
    const { children } = parse("[NOTE]\n====\nContent.\n====\n");
    expect(children).toHaveLength(2);
    expect(children[0].type).toBe("blockAttributeList");
    const node = admonitionAt(children, 1);
    expect(node.variant).toBe("note");
    expect(node.form).toBe("delimited");
    expect(node.delimiter).toBe("example");
    expect(node.content).toBeUndefined();
    expect(node.children.length).toBeGreaterThan(0);
  });

  test("[TIP] + example block", () => {
    const { children } = parse("[TIP]\n====\nA tip.\n====\n");
    expect(children).toHaveLength(2);
    const node = admonitionAt(children, 1);
    expect(node.variant).toBe("tip");
    expect(node.form).toBe("delimited");
    expect(node.delimiter).toBe("example");
  });

  test("[IMPORTANT] + example block", () => {
    const { children } = parse("[IMPORTANT]\n====\nDo not forget.\n====\n");
    const node = admonitionAt(children, 1);
    expect(node.variant).toBe("important");
  });

  test("[CAUTION] + example block", () => {
    const { children } = parse("[CAUTION]\n====\nWatch out.\n====\n");
    const node = admonitionAt(children, 1);
    expect(node.variant).toBe("caution");
  });

  test("[WARNING] + example block", () => {
    const { children } = parse("[WARNING]\n====\nBe careful.\n====\n");
    const node = admonitionAt(children, 1);
    expect(node.variant).toBe("warning");
  });

  test("block-form admonition with multiple paragraphs", () => {
    const { children } = parse(
      "[NOTE]\n====\nFirst paragraph.\n\nSecond paragraph.\n====\n",
    );
    expect(children).toHaveLength(2);
    const node = admonitionAt(children, 1);
    expect(node.variant).toBe("note");
    expect(node.children).toHaveLength(2);
    expect(node.children[0].type).toBe("paragraph");
    expect(node.children[1].type).toBe("paragraph");
  });
});

describe("block-form admonitions (open block)", () => {
  test("[CAUTION] + open block", () => {
    const { children } = parse("[CAUTION]\n--\nContent.\n--\n");
    expect(children).toHaveLength(2);
    expect(children[0].type).toBe("blockAttributeList");
    const node = admonitionAt(children, 1);
    expect(node.variant).toBe("caution");
    expect(node.form).toBe("delimited");
    expect(node.delimiter).toBe("open");
  });

  test("[NOTE] + open block with multiple paragraphs", () => {
    const { children } = parse("[NOTE]\n--\nFirst.\n\nSecond.\n--\n");
    expect(children).toHaveLength(2);
    const node = admonitionAt(children, 1);
    expect(node.variant).toBe("note");
    expect(node.delimiter).toBe("open");
    expect(node.children).toHaveLength(2);
  });
});

describe("admonition edge cases", () => {
  // Non-admonition attribute lists followed by parent blocks
  // should remain as regular parent blocks.
  test("[#myid] + example block is NOT an admonition", () => {
    const { children } = parse("[#myid]\n====\nContent.\n====\n");
    expect(children).toHaveLength(2);
    expect(children[0].type).toBe("blockAttributeList");
    expect(children[1].type).toBe("parentBlock");
  });

  // Lowercase admonition types in attribute lists should also
  // be recognized (AsciiDoc typically uses uppercase, but the
  // extractStyle function normalizes to uppercase).
  test("[note] lowercase in attribute list is recognized", () => {
    const { children } = parse("[note]\n====\nContent.\n====\n");
    expect(children).toHaveLength(2);
    const node = admonitionAt(children, 1);
    expect(node.variant).toBe("note");
  });

  // Custom/non-standard uppercase attribute list + parent block
  // becomes an admonition with the custom variant. Asciidoctor
  // treats any uppercase name as a custom admonition style.
  test("[EXERCISE] + example block is a custom admonition", () => {
    const { children } = parse("[EXERCISE]\n====\nContent.\n====\n");
    // The [EXERCISE] attribute list is kept as metadata,
    // followed by the admonition node.
    expect(children).toHaveLength(2);
    expect(children[0].type).toBe("blockAttributeList");
    expect(children[1].type).toBe("admonition");
    if (children[1].type === "admonition") {
      expect(children[1].variant).toBe("exercise");
      expect(children[1].form).toBe("delimited");
    }
  });
});
