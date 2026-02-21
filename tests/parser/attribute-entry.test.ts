/**
 * Parser tests for AsciiDoc attribute entries.
 *
 * Attribute entries are metadata declarations of the form `:name: value`.
 * They appear in the document header or body and set, unset, or assign
 * values to document attributes. The official ASG discards them, but a
 * formatter must preserve them to avoid losing metadata.
 *
 * Syntax variants:
 * - `:name: value` — set attribute to a value
 * - `:name:` — set attribute with no value (boolean/flag)
 * - `:!name:` — unset attribute (prefix form)
 * - `:name!:` — unset attribute (suffix form)
 */
import { describe, test, expect } from "vitest";
import { parse } from "../../src/parser.js";

describe("attribute entry parsing", () => {
  // The fundamental contract: `:name: value` must become an attribute
  // entry node, not a paragraph. Without this, attribute metadata would
  // be treated as prose and reflowed.
  test(":name: value parses as an attribute entry", () => {
    const document = parse(":source-highlighter: rouge\n");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("attributeEntry");
    if (document.children[0].type === "attributeEntry") {
      expect(document.children[0].name).toBe("source-highlighter");
      expect(document.children[0].value).toBe("rouge");
      expect(document.children[0].unset).toBe(false);
    }
  });

  // Boolean/flag attributes have no value — just `:toc:`. The parser
  // must distinguish "no value" (undefined) from "empty string value"
  // to faithfully reproduce the original syntax.
  test(":name: with no value parses correctly", () => {
    const document = parse(":toc:\n");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("attributeEntry");
    if (document.children[0].type === "attributeEntry") {
      expect(document.children[0].name).toBe("toc");
      expect(document.children[0].value).toBeUndefined();
      expect(document.children[0].unset).toBe(false);
    }
  });

  // The prefix unset form `:!name:` negates the attribute. The `!`
  // is stripped from the name and stored as the unset form so the
  // printer can reconstruct the original syntax.
  test(":!name: (prefix unset) parses correctly", () => {
    const document = parse(":!toc:\n");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("attributeEntry");
    if (document.children[0].type === "attributeEntry") {
      expect(document.children[0].name).toBe("toc");
      expect(document.children[0].value).toBeUndefined();
      expect(document.children[0].unset).toBe("prefix");
    }
  });

  // The suffix unset form `:name!:` is an alternative syntax. The
  // parser tracks which form was used so the printer can reproduce
  // the author's style choice.
  test(":name!: (suffix unset) parses correctly", () => {
    const document = parse(":toc!:\n");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("attributeEntry");
    if (document.children[0].type === "attributeEntry") {
      expect(document.children[0].name).toBe("toc");
      expect(document.children[0].value).toBeUndefined();
      expect(document.children[0].unset).toBe("suffix");
    }
  });

  // Prettier uses locStart/locEnd for cursor tracking and range
  // formatting. The attribute entry's position must cover the full
  // line from the opening `:` to the end of the value.
  test("attribute entry has correct position", () => {
    const document = parse(":author: Jane\n");
    expect(document.children[0].position.start.offset).toBe(0);
    expect(document.children[0].position.start.line).toBe(1);
    expect(document.children[0].position.start.column).toBe(1);
    // ":author: Jane" is 13 chars; end offset is exclusive
    const EXPECTED_END_OFFSET = 13;
    expect(document.children[0].position.end.offset).toBe(EXPECTED_END_OFFSET);
  });

  // Authors typically stack multiple attribute entries at the top of
  // a document. Each must be its own AST node so the printer can
  // emit them individually.
  test("consecutive attribute entries are separate nodes", () => {
    const document = parse(":author: Jane\n:revdate: 2024-01-01\n");
    expect(document.children).toHaveLength(2);
    expect(document.children[0].type).toBe("attributeEntry");
    expect(document.children[1].type).toBe("attributeEntry");
    if (document.children[0].type === "attributeEntry") {
      expect(document.children[0].name).toBe("author");
      expect(document.children[0].value).toBe("Jane");
    }
    if (document.children[1].type === "attributeEntry") {
      expect(document.children[1].name).toBe("revdate");
      expect(document.children[1].value).toBe("2024-01-01");
    }
  });

  // Attribute entries must survive as block-level nodes between
  // paragraphs, not be absorbed into adjacent paragraphs.
  test("attribute entry between paragraphs is preserved", () => {
    const document = parse("Before.\n\n:key: value\n\nAfter.\n");
    expect(document.children).toHaveLength(3);
    expect(document.children[0].type).toBe("paragraph");
    expect(document.children[1].type).toBe("attributeEntry");
    expect(document.children[2].type).toBe("paragraph");
  });

  // The AST builder's section-grouping logic must treat attribute
  // entries as children of the preceding section, just like
  // paragraphs and comments.
  test("attribute entry inside a section", () => {
    const document = parse("== Title\n\n:key: value\n\nText.\n");
    expect(document.children).toHaveLength(1);
    if (document.children[0].type === "section") {
      expect(document.children[0].children).toHaveLength(2);
      expect(document.children[0].children[0].type).toBe("attributeEntry");
      expect(document.children[0].children[1].type).toBe("paragraph");
    }
  });

  // Attribute names can start with underscores and contain hyphens
  // and digits. Verify the regex accepts the full range of valid
  // characters defined by AsciiDoc.
  test("attribute name with underscores and digits", () => {
    const document = parse(":_my-attr2: value\n");
    expect(document.children).toHaveLength(1);
    if (document.children[0].type === "attributeEntry") {
      expect(document.children[0].name).toBe("_my-attr2");
      expect(document.children[0].value).toBe("value");
    }
  });

  // A value with extra spaces after the colon should preserve only
  // the content (the single space after `:` is syntactic separator,
  // not part of the value).
  test("value with leading whitespace is trimmed", () => {
    const document = parse(":key:   spaced value\n");
    expect(document.children).toHaveLength(1);
    if (document.children[0].type === "attributeEntry") {
      expect(document.children[0].name).toBe("key");
      expect(document.children[0].value).toBe("spaced value");
    }
  });

  // Unset with a value (`:!name: value`) is unusual but syntactically
  // valid. The regex captures both the unset bang and the value. This
  // documents the parser's behavior for this edge case — the unset
  // form is "prefix" and the value is preserved.
  test("unset with value (:!name: value) preserves both", () => {
    const document = parse(":!experimental: value\n");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("attributeEntry");
    if (document.children[0].type === "attributeEntry") {
      expect(document.children[0].name).toBe("experimental");
      expect(document.children[0].unset).toBe("prefix");
      expect(document.children[0].value).toBe("value");
    }
  });

  // A value that is only whitespace (`:key:   `) should be treated
  // as no value after trimming. The AST builder trims the raw value
  // and collapses empty-after-trim to `undefined`. This guards
  // against regressions where whitespace-only values leak through
  // as empty strings.
  test("whitespace-only value treated as no value", () => {
    const document = parse(":key:   \n");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("attributeEntry");
    if (document.children[0].type === "attributeEntry") {
      expect(document.children[0].name).toBe("key");
      expect(document.children[0].value).toBeUndefined();
    }
  });
});
