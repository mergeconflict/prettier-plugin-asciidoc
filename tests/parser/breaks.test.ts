import { describe, test, expect } from "vitest";
import { parse } from "../../src/parser.js";

describe("thematic break parsing", () => {
  // Basic thematic break: exactly three single quotes.
  test("basic thematic break", () => {
    const { children } = parse("'''\n");
    expect(children).toHaveLength(1);
    expect(children[0].type).toBe("thematicBreak");
  });

  // Extended thematic break: more than three single quotes
  // is still a thematic break.
  test("extended thematic break", () => {
    const { children } = parse("''''\n");
    expect(children).toHaveLength(1);
    expect(children[0].type).toBe("thematicBreak");
  });

  // Between two paragraphs.
  test("thematic break between paragraphs", () => {
    const { children } = parse("Before.\n\n'''\n\nAfter.\n");
    expect(children).toHaveLength(3);
    expect(children[0].type).toBe("paragraph");
    expect(children[1].type).toBe("thematicBreak");
    expect(children[2].type).toBe("paragraph");
  });

  // At start of document.
  test("thematic break at start of document", () => {
    const { children } = parse("'''\n\nSome text.\n");
    expect(children).toHaveLength(2);
    expect(children[0].type).toBe("thematicBreak");
    expect(children[1].type).toBe("paragraph");
  });

  // At end of document.
  test("thematic break at end of document", () => {
    const { children } = parse("Some text.\n\n'''\n");
    expect(children).toHaveLength(2);
    expect(children[0].type).toBe("paragraph");
    expect(children[1].type).toBe("thematicBreak");
  });

  // Position tracking.
  test("position tracking", () => {
    const { children } = parse("'''\n");
    const [node] = children;
    expect(node.type).toBe("thematicBreak");
    expect(node.position.start.line).toBe(1);
    expect(node.position.start.column).toBe(1);
    expect(node.position.start.offset).toBe(0);
  });
});

describe("page break parsing", () => {
  // Basic page break: exactly three less-than signs.
  test("basic page break", () => {
    const { children } = parse("<<<\n");
    expect(children).toHaveLength(1);
    expect(children[0].type).toBe("pageBreak");
  });

  // Extended page break: more than three less-than signs.
  test("extended page break", () => {
    const { children } = parse("<<<<\n");
    expect(children).toHaveLength(1);
    expect(children[0].type).toBe("pageBreak");
  });

  // Between two paragraphs.
  test("page break between paragraphs", () => {
    const { children } = parse("Before.\n\n<<<\n\nAfter.\n");
    expect(children).toHaveLength(3);
    expect(children[0].type).toBe("paragraph");
    expect(children[1].type).toBe("pageBreak");
    expect(children[2].type).toBe("paragraph");
  });

  // At start of document.
  test("page break at start of document", () => {
    const { children } = parse("<<<\n\nSome text.\n");
    expect(children).toHaveLength(2);
    expect(children[0].type).toBe("pageBreak");
    expect(children[1].type).toBe("paragraph");
  });

  // At end of document.
  test("page break at end of document", () => {
    const { children } = parse("Some text.\n\n<<<\n");
    expect(children).toHaveLength(2);
    expect(children[0].type).toBe("paragraph");
    expect(children[1].type).toBe("pageBreak");
  });

  // Position tracking.
  test("position tracking", () => {
    const { children } = parse("<<<\n");
    const [node] = children;
    expect(node.type).toBe("pageBreak");
    expect(node.position.start.line).toBe(1);
    expect(node.position.start.column).toBe(1);
    expect(node.position.start.offset).toBe(0);
  });
});
