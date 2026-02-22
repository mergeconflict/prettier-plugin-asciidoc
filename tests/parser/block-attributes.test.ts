/**
 * Parser tests for block attribute lists, anchors, and titles.
 *
 * Block attributes are lines that precede a block and modify it:
 * - `[source,ruby]` — block attribute list
 * - `[[anchor-id]]` — block anchor
 * - `.Block Title` — block title
 *
 * These are parsed as standalone block-level nodes (like line
 * comments and attribute entries). The printer handles stacking
 * them with the following block (no blank line between them).
 */
import { describe, test, expect } from "vitest";
import { parse } from "../../src/parser.js";

describe("block attribute list parsing", () => {
  // The fundamental case: a positional attribute list like
  // [source,ruby] should become a blockAttributeList node,
  // not a paragraph.
  test("[source,ruby] parses as a block attribute list", () => {
    const document = parse("[source,ruby]\n");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("blockAttributeList");
    if (document.children[0].type === "blockAttributeList") {
      expect(document.children[0].value).toBe("source,ruby");
    }
  });

  // Shorthand ID syntax: [#myid] sets the block's ID.
  test("[#myid] shorthand ID parses correctly", () => {
    const document = parse("[#myid]\n");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("blockAttributeList");
    if (document.children[0].type === "blockAttributeList") {
      expect(document.children[0].value).toBe("#myid");
    }
  });

  // Shorthand role syntax: [.role] sets the block's role.
  test("[.role] shorthand role parses correctly", () => {
    const document = parse("[.role]\n");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("blockAttributeList");
    if (document.children[0].type === "blockAttributeList") {
      expect(document.children[0].value).toBe(".role");
    }
  });

  // Combined shorthand: [#id.role%option] with ID, role, and
  // option all in one attribute list.
  test("[#id.role%option] combined shorthand", () => {
    const document = parse("[#id.role%option]\n");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("blockAttributeList");
    if (document.children[0].type === "blockAttributeList") {
      expect(document.children[0].value).toBe("#id.role%option");
    }
  });

  // Named attributes: [start=7] on an ordered list.
  test("[start=7] named attribute", () => {
    const document = parse("[start=7]\n");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("blockAttributeList");
    if (document.children[0].type === "blockAttributeList") {
      expect(document.children[0].value).toBe("start=7");
    }
  });

  // Style attributes like [abstract], [appendix] before sections.
  test("[abstract] style attribute", () => {
    const document = parse("[abstract]\n");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("blockAttributeList");
    if (document.children[0].type === "blockAttributeList") {
      expect(document.children[0].value).toBe("abstract");
    }
  });

  // Block attribute list before a listing block should stack.
  test("attribute list before a listing block", () => {
    const document = parse("[source,ruby]\n----\nputs 'hello'\n----\n");
    expect(document.children).toHaveLength(2);
    expect(document.children[0].type).toBe("blockAttributeList");
    expect(document.children[1].type).toBe("delimitedBlock");
  });

  // Multiple attribute lines stacked before a block.
  test("multiple attribute lines stacked before a block", () => {
    const document = parse(
      "[source,ruby]\n[#myid]\n----\nputs 'hello'\n----\n",
    );
    expect(document.children).toHaveLength(3);
    expect(document.children[0].type).toBe("blockAttributeList");
    expect(document.children[1].type).toBe("blockAttributeList");
    expect(document.children[2].type).toBe("delimitedBlock");
  });

  // Position tracking: start and end offsets.
  test("block attribute list has correct position", () => {
    const document = parse("[source,ruby]\n");
    expect(document.children[0].position.start.offset).toBe(0);
    expect(document.children[0].position.start.line).toBe(1);
    expect(document.children[0].position.start.column).toBe(1);
    // "[source,ruby]" is 13 chars; end offset is exclusive
    const EXPECTED_END_OFFSET = 13;
    expect(document.children[0].position.end.offset).toBe(EXPECTED_END_OFFSET);
  });

  // Empty attribute list: [] should parse correctly.
  test("empty attribute list [] parses correctly", () => {
    const document = parse("[]\n");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("blockAttributeList");
    if (document.children[0].type === "blockAttributeList") {
      expect(document.children[0].value).toBe("");
    }
  });
});

describe("block anchor parsing", () => {
  // Block anchor: [[anchor-id]] creates an anchor point.
  test("[[anchor-id]] parses as a block anchor", () => {
    const document = parse("[[anchor-id]]\n");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("blockAnchor");
    if (document.children[0].type === "blockAnchor") {
      expect(document.children[0].id).toBe("anchor-id");
      expect(document.children[0].reftext).toBeUndefined();
    }
  });

  // Anchor with reftext: [[id,reftext]] — the id and reftext
  // are split on the first comma.
  test("[[id,reftext]] anchor with reftext", () => {
    const document = parse("[[my-id,My Reference Text]]\n");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("blockAnchor");
    if (document.children[0].type === "blockAnchor") {
      expect(document.children[0].id).toBe("my-id");
      expect(document.children[0].reftext).toBe("My Reference Text");
    }
  });

  // Anchor before a paragraph.
  test("block anchor before a paragraph", () => {
    const document = parse("[[my-anchor]]\nSome text.\n");
    expect(document.children).toHaveLength(2);
    expect(document.children[0].type).toBe("blockAnchor");
    expect(document.children[1].type).toBe("paragraph");
  });

  // Anchor position tracking.
  test("block anchor has correct position", () => {
    const document = parse("[[my-id]]\n");
    expect(document.children[0].position.start.offset).toBe(0);
    expect(document.children[0].position.start.line).toBe(1);
    expect(document.children[0].position.start.column).toBe(1);
    // "[[my-id]]" is 9 chars; end offset is exclusive
    const EXPECTED_END_OFFSET = 9;
    expect(document.children[0].position.end.offset).toBe(EXPECTED_END_OFFSET);
  });
});

describe("block title parsing", () => {
  // Block title: .Title text — a dot followed by non-whitespace.
  test(".Title parses as a block title", () => {
    const document = parse(".My Title\n");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("blockTitle");
    if (document.children[0].type === "blockTitle") {
      expect(document.children[0].title).toBe("My Title");
    }
  });

  // Block title before a listing block.
  test("block title before a listing block", () => {
    const document = parse(".Example Code\n----\nputs 'hello'\n----\n");
    expect(document.children).toHaveLength(2);
    expect(document.children[0].type).toBe("blockTitle");
    expect(document.children[1].type).toBe("delimitedBlock");
  });

  // Block title before a paragraph.
  test("block title before a paragraph", () => {
    const document = parse(".Important Note\nThis is the note text.\n");
    expect(document.children).toHaveLength(2);
    expect(document.children[0].type).toBe("blockTitle");
    expect(document.children[1].type).toBe("paragraph");
  });

  // Block title must not conflict with ordered list markers.
  // `. text` (dot space text) is an ordered list marker, not a title.
  test("'. text' is an ordered list, not a block title", () => {
    const document = parse(". Item one\n");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("list");
  });

  // Block title must not conflict with literal block delimiters.
  // `....` is a literal block delimiter, not a title.
  test("'....' is a literal block delimiter, not a title", () => {
    const document = parse("....\ncontent\n....\n");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("delimitedBlock");
  });

  // Title + attribute list stacked before a block.
  test("title and attribute list before a block", () => {
    const document = parse(
      ".Example Code\n[source,ruby]\n----\nputs 'hello'\n----\n",
    );
    expect(document.children).toHaveLength(3);
    expect(document.children[0].type).toBe("blockTitle");
    expect(document.children[1].type).toBe("blockAttributeList");
    expect(document.children[2].type).toBe("delimitedBlock");
  });

  // Block title position tracking.
  test("block title has correct position", () => {
    const document = parse(".My Title\n");
    expect(document.children[0].position.start.offset).toBe(0);
    expect(document.children[0].position.start.line).toBe(1);
    expect(document.children[0].position.start.column).toBe(1);
    // ".My Title" is 9 chars; end offset is exclusive
    const EXPECTED_END_OFFSET = 9;
    expect(document.children[0].position.end.offset).toBe(EXPECTED_END_OFFSET);
  });

  // Block title with special characters in the text.
  test("block title with special characters", () => {
    const document = parse(".Title: a `code` example\n");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("blockTitle");
    if (document.children[0].type === "blockTitle") {
      expect(document.children[0].title).toBe("Title: a `code` example");
    }
  });
});

describe("combined block metadata", () => {
  // All three types stacked: anchor, title, attribute list.
  test("anchor + title + attribute list before a block", () => {
    const document = parse(
      "[[my-id]]\n.My Title\n[source,ruby]\n----\nputs 'hello'\n----\n",
    );
    expect(document.children).toHaveLength(4);
    expect(document.children[0].type).toBe("blockAnchor");
    expect(document.children[1].type).toBe("blockTitle");
    expect(document.children[2].type).toBe("blockAttributeList");
    expect(document.children[3].type).toBe("delimitedBlock");
  });

  // Style attributes before sections are preserved.
  test("[appendix] before a section", () => {
    const document = parse("[appendix]\n== Appendix A\n");
    expect(document.children).toHaveLength(2);
    expect(document.children[0].type).toBe("blockAttributeList");
    expect(document.children[1].type).toBe("section");
  });
});
