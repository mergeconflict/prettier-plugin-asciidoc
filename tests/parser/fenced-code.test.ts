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

describe("fenced code block parsing", () => {
  // Backtick-fenced code block with language hint produces a
  // listing block with the language captured.
  test("fenced block with language", () => {
    const { children } = parse("```rust\nfn main() {}\n```\n");
    expect(children).toHaveLength(1);
    const block = firstDelimitedBlock(children);
    expect(block.variant).toBe("listing");
    expect(block.language).toBe("rust");
    expect(block.content).toBe("fn main() {}");
  });

  // Backtick-fenced code block without a language hint.
  test("fenced block without language", () => {
    const { children } = parse("```\nhello world\n```\n");
    expect(children).toHaveLength(1);
    const block = firstDelimitedBlock(children);
    expect(block.variant).toBe("listing");
    expect(block.language).toBeUndefined();
    expect(block.content).toBe("hello world");
  });

  // Multi-line content is preserved verbatim.
  test("multi-line content preserved", () => {
    const input = '```rust\nfn main() {\n    println!("Hello");\n}\n```\n';
    const { children } = parse(input);
    const block = firstDelimitedBlock(children);
    expect(block.variant).toBe("listing");
    expect(block.language).toBe("rust");
    expect(block.content).toBe('fn main() {\n    println!("Hello");\n}');
  });

  // Empty fenced code block.
  test("empty fenced code block", () => {
    const { children } = parse("```\n```\n");
    const block = firstDelimitedBlock(children);
    expect(block.variant).toBe("listing");
    expect(block.content).toBe("");
  });

  // Fenced code block between paragraphs.
  test("between paragraphs", () => {
    const { children } = parse(
      "Before.\n\n```js\nconst x = 1;\n```\n\nAfter.\n",
    );
    expect(children).toHaveLength(3);
    expect(children[0].type).toBe("paragraph");
    expect(children[1].type).toBe("delimitedBlock");
    expect(children[2].type).toBe("paragraph");
    const block = firstDelimitedBlock(children.slice(1));
    expect(block.language).toBe("js");
  });

  // Content with backticks (fewer than 3) inside is preserved.
  test("backticks inside content are preserved", () => {
    const { children } = parse("```\nuse `backtick` here\n```\n");
    const block = firstDelimitedBlock(children);
    expect(block.content).toBe("use `backtick` here");
  });

  // AsciiDoc-style delimiters inside fenced block are content.
  test("asciidoc delimiters inside fenced block are content", () => {
    const { children } = parse("```\n----\ncode\n----\n```\n");
    const block = firstDelimitedBlock(children);
    expect(block.content).toBe("----\ncode\n----");
  });

  // Trailing whitespace after the language hint is trimmed.
  test("trailing whitespace on language hint is trimmed", () => {
    const { children } = parse("```rust  \nfn main() {}\n```\n");
    const block = firstDelimitedBlock(children);
    expect(block.language).toBe("rust");
  });
});
