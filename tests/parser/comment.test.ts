/**
 * Parser tests for AsciiDoc comments.
 *
 * Comments are not part of the AsciiDoc ASG -- they're discarded by the
 * reference toolchain. But a formatter must preserve them, so our AST
 * includes CommentNode for both line and block comments.
 *
 * Line comment: `// text` (two slashes then space or EOL).
 * `//` alone on a line is an empty comment.
 * `//path` is NOT a comment -- there must be a space after //.
 *
 * Block comment: delimited by `////` (4+ slashes) on its own line.
 * Content inside is verbatim and not parsed further.
 */
import { describe, test, expect } from "vitest";
import { parse } from "../../src/parser.js";

describe("line comment parsing", () => {
  // Verifies the fundamental contract: `// text` becomes a comment node,
  // not a paragraph. Without this, comments would be treated as prose.
  test("// text parses as a line comment", () => {
    const document = parse("// this is a comment\n");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("comment");
    if (document.children[0].type === "comment") {
      expect(document.children[0].commentType).toBe("line");
      expect(document.children[0].value).toBe("this is a comment");
    }
  });

  // `//` alone is a valid empty comment in AsciiDoc. The lexer's negative
  // lookahead `(?!\S)` must accept end-of-line, not just space-then-text.
  test("// alone on a line is an empty comment", () => {
    const document = parse("//\n");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("comment");
    if (document.children[0].type === "comment") {
      expect(document.children[0].commentType).toBe("line");
      expect(document.children[0].value).toBe("");
    }
  });

  // `//path` (no space after slashes) is valid text in AsciiDoc, not a
  // comment. The lexer's `(?!\S)` lookahead rejects `//` followed by a
  // non-whitespace character. Without this distinction, file paths and
  // URLs containing `//` would be swallowed as comments.
  test("//path (no space) is NOT a comment", () => {
    const document = parse("//path\n");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("paragraph");
  });

  // The `(?!\S)` lookahead accepts any whitespace after `//`, not
  // just space. A tab character is whitespace, so `//\t` followed
  // by text is a valid line comment. Note that only a literal space
  // is stripped from the value — a tab is preserved as part of the
  // content. Guards against regressions where the lookahead is
  // tightened to require a literal space character.
  test("//[tab] (tab after slashes) is a valid line comment", () => {
    const tab = "\t";
    const document = parse(`//${tab}indented remark\n`);
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("comment");
    if (document.children[0].type === "comment") {
      expect(document.children[0].commentType).toBe("line");
      expect(document.children[0].value).toBe(`${tab}indented remark`);
    }
  });

  // Authors often stack line comments. Each must be its own AST node so
  // the printer can emit them individually — merging would lose the
  // per-line `//` markers and change the document's meaning.
  test("consecutive line comments are separate nodes", () => {
    const document = parse("// first\n// second\n");
    expect(document.children).toHaveLength(2);
    expect(document.children[0].type).toBe("comment");
    expect(document.children[1].type).toBe("comment");
    if (document.children[0].type === "comment") {
      expect(document.children[0].value).toBe("first");
    }
    if (document.children[1].type === "comment") {
      expect(document.children[1].value).toBe("second");
    }
  });

  // Prettier uses locStart/locEnd for cursor tracking and range
  // formatting. The comment's position must start at the `//` marker
  // (not the text after it) so Prettier can correctly locate the
  // node in the source.
  test("line comment has correct position", () => {
    const document = parse("// hello\n");
    expect(document.children[0].position.start.offset).toBe(0);
    expect(document.children[0].position.start.line).toBe(1);
    expect(document.children[0].position.start.column).toBe(1);
    // End offset is exclusive, after "// hello" (8 chars)
    expect(document.children[0].position.end.offset).toBe(8);
  });

  // Comments must survive as block-level nodes between paragraphs.
  // If the parser swallowed them during blank-line handling, they'd
  // disappear from the formatted output.
  test("comment between paragraphs is preserved", () => {
    const document = parse("First.\n\n// comment\n\nSecond.\n");
    expect(document.children).toHaveLength(3);
    expect(document.children[0].type).toBe("paragraph");
    expect(document.children[1].type).toBe("comment");
    expect(document.children[2].type).toBe("paragraph");
  });

  // The AST builder's section-grouping logic must treat comments as
  // children of the preceding section, just like paragraphs. A comment
  // between a heading and its content shouldn't break the section.
  test("comment inside a section", () => {
    const document = parse("== Title\n\n// remark\n\nText.\n");
    expect(document.children).toHaveLength(1);
    if (document.children[0].type === "section") {
      expect(document.children[0].children).toHaveLength(2);
      expect(document.children[0].children[0].type).toBe("comment");
      expect(document.children[0].children[1].type).toBe("paragraph");
    }
  });
});

describe("block comment parsing", () => {
  // The core block comment contract: `////` delimiters wrap verbatim
  // content that must not be parsed as AsciiDoc. If the lexer mode
  // switch fails, the content would be tokenized as paragraphs.
  test("block comment with content", () => {
    const document = parse("////\nblock content\n////\n");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("comment");
    if (document.children[0].type === "comment") {
      expect(document.children[0].commentType).toBe("block");
      expect(document.children[0].value).toBe("block content");
    }
  });

  // Empty block comments (`////\n////`) are valid and must not confuse
  // the lexer mode — it should pop back to default even with no content
  // tokens between the delimiters.
  test("empty block comment", () => {
    const document = parse("////\n////\n");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("comment");
    if (document.children[0].type === "comment") {
      expect(document.children[0].commentType).toBe("block");
      expect(document.children[0].value).toBe("");
    }
  });

  // Multi-line content must be preserved with its internal newlines
  // intact. The AST builder joins BlockCommentContent tokens with
  // newlines — verify that reconstructed value matches the original.
  test("block comment with multiple lines", () => {
    const document = parse("////\nline one\nline two\nline three\n////\n");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("comment");
    if (document.children[0].type === "comment") {
      expect(document.children[0].commentType).toBe("block");
      expect(document.children[0].value).toBe("line one\nline two\nline three");
    }
  });

  // Block comments can contain blank lines (e.g. separating paragraphs
  // of commented-out prose). The verbatim content extraction must
  // preserve internal blank lines exactly — losing them would silently
  // alter the commented-out content when formatting.
  test("block comment preserves internal blank lines", () => {
    const document = parse("////\nline one\n\nline three\n////\n");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("comment");
    if (document.children[0].type === "comment") {
      expect(document.children[0].commentType).toBe("block");
      expect(document.children[0].value).toBe("line one\n\nline three");
    }
  });

  // Same structural test as for line comments: block comments between
  // paragraphs must appear as their own block-level nodes, not get
  // absorbed into the adjacent paragraphs.
  test("block comment between paragraphs", () => {
    const document = parse("Before.\n\n////\nhidden\n////\n\nAfter.\n");
    expect(document.children).toHaveLength(3);
    expect(document.children[0].type).toBe("paragraph");
    expect(document.children[1].type).toBe("comment");
    expect(document.children[2].type).toBe("paragraph");
  });

  // Block comment position must cover the opening delimiter so
  // Prettier's range formatting can find the node. Without correct
  // positions, `--range-start`/`--range-end` would skip comments.
  test("block comment has correct position", () => {
    const document = parse("////\ncontent\n////\n");
    expect(document.children[0].position.start.offset).toBe(0);
    expect(document.children[0].position.start.line).toBe(1);
    expect(document.children[0].position.start.column).toBe(1);
  });

  // AsciiDoc allows delimiters longer than 4 slashes (`//////`).
  // The lexer pattern `/{4,}` must accept these without creating a
  // mismatch between open and close delimiter lengths.
  test("block comment with extended delimiter (5+ slashes)", () => {
    const document = parse("//////\ncontent\n//////\n");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("comment");
    if (document.children[0].type === "comment") {
      expect(document.children[0].commentType).toBe("block");
      expect(document.children[0].value).toBe("content");
    }
  });

  // A block comment at the very end of the file may have no trailing
  // newline after the closing delimiter. This exercises the grammar's
  // `OPTION(() => this.CONSUME2(Newline))` — the optional newline
  // after the close delimiter must not be required.
  test("block comment at EOF without trailing newline", () => {
    const document = parse("////\ncontent\n////");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("comment");
    if (document.children[0].type === "comment") {
      expect(document.children[0].commentType).toBe("block");
      expect(document.children[0].value).toBe("content");
    }
  });

  // AsciiDoc allows mismatched delimiter lengths: a 4-slash open
  // and a 6-slash close are both valid `/{4,}` patterns. The lexer
  // should accept this without error. Guards against regressions
  // where the parser tries to match open/close delimiter lengths.
  test("mismatched delimiter lengths (4-open, 6-close)", () => {
    const document = parse("////\ncontent\n//////\n");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("comment");
    if (document.children[0].type === "comment") {
      expect(document.children[0].commentType).toBe("block");
      expect(document.children[0].value).toBe("content");
    }
  });
});
