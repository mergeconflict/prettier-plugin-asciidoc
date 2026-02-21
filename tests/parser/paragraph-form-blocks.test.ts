/**
 * Parser tests for paragraph-form blocks.
 *
 * When a block attribute list like `[source]`, `[listing]`,
 * `[verse]`, `[quote]`, etc. precedes a paragraph, the
 * paragraph becomes a paragraph-form block instead of a plain
 * paragraph. These produce `DelimitedBlockNode` with
 * `form: "paragraph"`.
 *
 * The attribute list remains as a separate `BlockAttributeListNode`
 * (just like it does for delimited blocks). The stacking behavior
 * in the printer handles the no-blank-line between them.
 */
import { describe, test, expect } from "vitest";
import { parse } from "../../src/parser.js";
import type { DelimitedBlockNode } from "../../src/ast.js";

// Helper to extract the delimited block at a given index.
function delimitedBlockAt(
  children: ReturnType<typeof parse>["children"],
  index: number,
): DelimitedBlockNode {
  const { [index]: block } = children;
  if (block.type !== "delimitedBlock") {
    throw new Error(
      `Expected delimitedBlock at index ${String(index)}, got ${block.type}`,
    );
  }
  return block;
}

describe("paragraph-form source/listing blocks", () => {
  // [source] + paragraph → attr list + listing block.
  test("[source] + paragraph produces listing block", () => {
    const { children } = parse(
      "[source]\nputs 'hello'\n",
    );
    expect(children).toHaveLength(2);
    expect(children[0].type).toBe("blockAttributeList");
    const block = delimitedBlockAt(children, 1);
    expect(block.variant).toBe("listing");
    expect(block.form).toBe("paragraph");
    expect(block.content).toBe("puts 'hello'");
  });

  // [source,ruby] with language parameter.
  test("[source,ruby] + paragraph produces listing block", () => {
    const { children } = parse(
      "[source,ruby]\nputs 'hello'\n",
    );
    expect(children).toHaveLength(2);
    expect(children[0].type).toBe("blockAttributeList");
    const block = delimitedBlockAt(children, 1);
    expect(block.variant).toBe("listing");
    expect(block.form).toBe("paragraph");
    expect(block.content).toBe("puts 'hello'");
  });

  // [listing] + paragraph → listing block, paragraph form.
  // Note: paragraph-form blocks use the default lexer mode, so
  // indented lines are tokenized separately. Content here must
  // be non-indented text (indented code belongs in a delimited
  // block with ---- delimiters).
  test("[listing] + paragraph produces listing block", () => {
    const { children } = parse(
      "[listing]\ndef foo\nbar\nend\n",
    );
    expect(children).toHaveLength(2);
    expect(children[0].type).toBe("blockAttributeList");
    const block = delimitedBlockAt(children, 1);
    expect(block.variant).toBe("listing");
    expect(block.form).toBe("paragraph");
    expect(block.content).toBe("def foo\nbar\nend");
  });

  // Multi-line content in a source block.
  test("[source] with multi-line content", () => {
    const { children } = parse(
      "[source]\nline 1\nline 2\nline 3\n",
    );
    expect(children).toHaveLength(2);
    const block = delimitedBlockAt(children, 1);
    expect(block.content).toBe("line 1\nline 2\nline 3");
  });
});

describe("paragraph-form literal blocks", () => {
  // [literal] + paragraph → literal block, paragraph form.
  test("[literal] + paragraph produces literal block", () => {
    const { children } = parse(
      "[literal]\nsome literal text\n",
    );
    expect(children).toHaveLength(2);
    expect(children[0].type).toBe("blockAttributeList");
    const block = delimitedBlockAt(children, 1);
    expect(block.variant).toBe("literal");
    expect(block.form).toBe("paragraph");
    expect(block.content).toBe("some literal text");
  });
});

describe("paragraph-form pass blocks", () => {
  // [pass] + paragraph → pass block, paragraph form.
  test("[pass] + paragraph produces pass block", () => {
    const { children } = parse(
      "[pass]\n<div>raw html</div>\n",
    );
    expect(children).toHaveLength(2);
    expect(children[0].type).toBe("blockAttributeList");
    const block = delimitedBlockAt(children, 1);
    expect(block.variant).toBe("pass");
    expect(block.form).toBe("paragraph");
    expect(block.content).toBe("<div>raw html</div>");
  });
});

describe("paragraph-form verse blocks", () => {
  // [verse] + paragraph → verse block, paragraph form.
  // Verse preserves line breaks.
  test("[verse] + paragraph produces verse block", () => {
    const { children } = parse(
      "[verse]\nRoses are red,\nViolets are blue.\n",
    );
    expect(children).toHaveLength(2);
    expect(children[0].type).toBe("blockAttributeList");
    const block = delimitedBlockAt(children, 1);
    expect(block.variant).toBe("verse");
    expect(block.form).toBe("paragraph");
    expect(block.content).toBe(
      "Roses are red,\nViolets are blue.",
    );
  });

  // [verse] with attribution.
  test("[verse, Author, Source] parses attribution in attr list", () => {
    const { children } = parse(
      "[verse, Robert Frost, Fire and Ice]\nSome say the world will end in fire,\nSome say in ice.\n",
    );
    expect(children).toHaveLength(2);
    expect(children[0].type).toBe("blockAttributeList");
    const block = delimitedBlockAt(children, 1);
    expect(block.variant).toBe("verse");
    expect(block.form).toBe("paragraph");
    expect(block.content).toBe(
      "Some say the world will end in fire,\nSome say in ice.",
    );
  });
});

describe("paragraph-form quote blocks", () => {
  // [quote] + paragraph → quote block, paragraph form.
  test("[quote] + paragraph produces quote block", () => {
    const { children } = parse(
      "[quote]\nTo be or not to be.\n",
    );
    expect(children).toHaveLength(2);
    expect(children[0].type).toBe("blockAttributeList");
    const block = delimitedBlockAt(children, 1);
    expect(block.variant).toBe("quote");
    expect(block.form).toBe("paragraph");
    expect(block.content).toBe("To be or not to be.");
  });

  // [quote] with attribution.
  test("[quote, Author, Source] with attribution", () => {
    const { children } = parse(
      "[quote, Shakespeare, Hamlet]\nTo be or not to be.\n",
    );
    expect(children).toHaveLength(2);
    expect(children[0].type).toBe("blockAttributeList");
    const block = delimitedBlockAt(children, 1);
    expect(block.variant).toBe("quote");
    expect(block.form).toBe("paragraph");
    expect(block.content).toBe("To be or not to be.");
  });
});

describe("paragraph-form example blocks", () => {
  // [example] + paragraph → example block, paragraph form.
  test("[example] + paragraph produces example block", () => {
    const { children } = parse(
      "[example]\nThis is an example.\n",
    );
    expect(children).toHaveLength(2);
    expect(children[0].type).toBe("blockAttributeList");
    const block = delimitedBlockAt(children, 1);
    expect(block.variant).toBe("example");
    expect(block.form).toBe("paragraph");
    expect(block.content).toBe("This is an example.");
  });
});

describe("paragraph-form sidebar blocks", () => {
  // [sidebar] + paragraph → sidebar block, paragraph form.
  test("[sidebar] + paragraph produces sidebar block", () => {
    const { children } = parse(
      "[sidebar]\nThis is sidebar content.\n",
    );
    expect(children).toHaveLength(2);
    expect(children[0].type).toBe("blockAttributeList");
    const block = delimitedBlockAt(children, 1);
    expect(block.variant).toBe("sidebar");
    expect(block.form).toBe("paragraph");
    expect(block.content).toBe("This is sidebar content.");
  });
});

describe("paragraph-form block boundaries", () => {
  // A paragraph-form block followed by a blank line and
  // normal paragraph — correct boundary detection.
  test("paragraph-form block followed by normal paragraph", () => {
    const { children } = parse(
      "[source]\nsome code\n\nNormal paragraph.\n",
    );
    expect(children).toHaveLength(3);
    expect(children[0].type).toBe("blockAttributeList");
    const block = delimitedBlockAt(children, 1);
    expect(block.variant).toBe("listing");
    expect(block.form).toBe("paragraph");
    expect(block.content).toBe("some code");
    expect(children[2].type).toBe("paragraph");
  });

  // Regular attribute lists that are NOT paragraph-form styles
  // should still be standalone nodes followed by a paragraph.
  test("non-style attribute list remains standalone", () => {
    const { children } = parse(
      "[#myid]\nSome text.\n",
    );
    expect(children).toHaveLength(2);
    expect(children[0].type).toBe("blockAttributeList");
    expect(children[1].type).toBe("paragraph");
  });

  // Paragraph-form block with block metadata before it.
  test("block title + [source] + paragraph", () => {
    const { children } = parse(
      ".My Code\n[source]\nsome code\n",
    );
    expect(children).toHaveLength(3);
    expect(children[0].type).toBe("blockTitle");
    expect(children[1].type).toBe("blockAttributeList");
    const block = delimitedBlockAt(children, 2);
    expect(block.variant).toBe("listing");
    expect(block.form).toBe("paragraph");
  });

  // Case insensitivity: AsciiDoc styles are case-insensitive
  // but conventionally lowercase. We only match lowercase.
  test("uppercase [SOURCE] is NOT a paragraph-form block", () => {
    const { children } = parse(
      "[SOURCE]\nsome code\n",
    );
    // Should parse as attribute list + paragraph.
    expect(children).toHaveLength(2);
    expect(children[0].type).toBe("blockAttributeList");
    expect(children[1].type).toBe("paragraph");
  });
});
