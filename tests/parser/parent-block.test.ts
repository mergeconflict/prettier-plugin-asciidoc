import { describe, test, expect } from "vitest";
import { parse } from "../../src/parser.js";
import type { ParentBlockNode } from "../../src/ast.js";

// Helper to extract the first parent block from parsed children.
function firstParentBlock(
  children: ReturnType<typeof parse>["children"],
): ParentBlockNode {
  const [block] = children;
  if (block.type !== "parentBlock") {
    throw new Error(`Expected parentBlock, got ${block.type}`);
  }
  return block;
}

describe("example block parsing", () => {
  // Basic example block with paragraph content.
  test("basic example block", () => {
    const { children } = parse("====\nSome content.\n====\n");
    expect(children).toHaveLength(1);
    const block = firstParentBlock(children);
    expect(block.variant).toBe("example");
    expect(block.children).toHaveLength(1);
    expect(block.children[0].type).toBe("paragraph");
  });

  // Empty example block (no content between delimiters).
  test("empty example block", () => {
    const { children } = parse("====\n====\n");
    const block = firstParentBlock(children);
    expect(block.variant).toBe("example");
    expect(block.children).toHaveLength(0);
  });

  // Example block with multiple paragraphs separated by
  // blank lines.
  test("multiple inner paragraphs", () => {
    const { children } = parse(
      "====\nFirst paragraph.\n\nSecond paragraph.\n====\n",
    );
    const block = firstParentBlock(children);
    expect(block.variant).toBe("example");
    expect(block.children).toHaveLength(2);
    expect(block.children[0].type).toBe("paragraph");
    expect(block.children[1].type).toBe("paragraph");
  });

  // Extended example delimiter (more than 4 equals signs).
  test("extended delimiter length", () => {
    const { children } = parse("======\nContent.\n======\n");
    const block = firstParentBlock(children);
    expect(block.variant).toBe("example");
    expect(block.children).toHaveLength(1);
  });
});

describe("sidebar block parsing", () => {
  // Basic sidebar block with paragraph content.
  test("basic sidebar block", () => {
    const { children } = parse("****\nSidebar content.\n****\n");
    expect(children).toHaveLength(1);
    const block = firstParentBlock(children);
    expect(block.variant).toBe("sidebar");
    expect(block.children).toHaveLength(1);
    expect(block.children[0].type).toBe("paragraph");
  });

  // Empty sidebar block.
  test("empty sidebar block", () => {
    const { children } = parse("****\n****\n");
    const block = firstParentBlock(children);
    expect(block.variant).toBe("sidebar");
    expect(block.children).toHaveLength(0);
  });

  // Sidebar block with multiple inner paragraphs.
  test("multiple inner paragraphs", () => {
    const { children } = parse(
      "****\nFirst.\n\nSecond.\n****\n",
    );
    const block = firstParentBlock(children);
    expect(block.variant).toBe("sidebar");
    expect(block.children).toHaveLength(2);
  });
});

describe("open block parsing", () => {
  // Basic open block with paragraph content.
  test("basic open block", () => {
    const { children } = parse("--\nOpen content.\n--\n");
    expect(children).toHaveLength(1);
    const block = firstParentBlock(children);
    expect(block.variant).toBe("open");
    expect(block.children).toHaveLength(1);
    expect(block.children[0].type).toBe("paragraph");
  });

  // Empty open block.
  test("empty open block", () => {
    const { children } = parse("--\n--\n");
    const block = firstParentBlock(children);
    expect(block.variant).toBe("open");
    expect(block.children).toHaveLength(0);
  });

  // Open block with multiple inner paragraphs.
  test("multiple inner paragraphs", () => {
    const { children } = parse(
      "--\nFirst.\n\nSecond.\n--\n",
    );
    const block = firstParentBlock(children);
    expect(block.variant).toBe("open");
    expect(block.children).toHaveLength(2);
  });
});

describe("quote block parsing", () => {
  // Basic quote block with paragraph content.
  test("basic quote block", () => {
    const { children } = parse("____\nQuoted text.\n____\n");
    expect(children).toHaveLength(1);
    const block = firstParentBlock(children);
    expect(block.variant).toBe("quote");
    expect(block.children).toHaveLength(1);
    expect(block.children[0].type).toBe("paragraph");
  });

  // Empty quote block.
  test("empty quote block", () => {
    const { children } = parse("____\n____\n");
    const block = firstParentBlock(children);
    expect(block.variant).toBe("quote");
    expect(block.children).toHaveLength(0);
  });

  // Quote block with multiple inner paragraphs.
  test("multiple inner paragraphs", () => {
    const { children } = parse(
      "____\nFirst.\n\nSecond.\n____\n",
    );
    const block = firstParentBlock(children);
    expect(block.variant).toBe("quote");
    expect(block.children).toHaveLength(2);
  });
});

describe("parent block context", () => {
  // Parent block between paragraphs.
  test("between paragraphs", () => {
    const { children } = parse(
      "Before.\n\n====\nInside.\n====\n\nAfter.\n",
    );
    expect(children).toHaveLength(3);
    expect(children[0].type).toBe("paragraph");
    expect(children[1].type).toBe("parentBlock");
    expect(children[2].type).toBe("paragraph");
  });

  // Position tracking: start position of parent block.
  test("position tracking", () => {
    const { children } = parse("====\nContent.\n====\n");
    const block = firstParentBlock(children);
    expect(block.position.start.line).toBe(1);
    expect(block.position.start.column).toBe(1);
    expect(block.position.start.offset).toBe(0);
  });

  // Nested parent blocks: example inside sidebar.
  test("nested parent blocks", () => {
    const { children } = parse(
      "****\n====\nNested content.\n====\n****\n",
    );
    const outer = firstParentBlock(children);
    expect(outer.variant).toBe("sidebar");
    expect(outer.children).toHaveLength(1);
    const inner = firstParentBlock(outer.children);
    expect(inner.variant).toBe("example");
    const { children: innerChildren } = inner;
    expect(innerChildren).toHaveLength(1);
    expect(innerChildren[0]).toHaveProperty("type", "paragraph");
  });

  // A listing block (leaf) inside a parent block.
  test("leaf block inside parent block", () => {
    const { children } = parse(
      "====\n----\ncode\n----\n====\n",
    );
    const block = firstParentBlock(children);
    expect(block.variant).toBe("example");
    expect(block.children).toHaveLength(1);
    expect(block.children[0].type).toBe("delimitedBlock");
  });
});
