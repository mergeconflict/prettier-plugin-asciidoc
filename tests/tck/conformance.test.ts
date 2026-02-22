/**
 * TCK (Technology Compatibility Kit) conformance tests.
 *
 * These tests parse vendored AsciiDoc input files with our
 * parser, convert the AST to ASG format using toASG(), and
 * compare against the official expected output JSON files from
 * the asciidoc-tck repository.
 *
 * Fixtures requiring unimplemented constructs are catalogued as
 * `test.todo` with a comment noting which task will address
 * them. As features are implemented, these should be promoted
 * to real tests (turning red then green is the TDD loop).
 */

import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "../../src/parser.js";
import { toASG, toASGInlines } from "./to-asg.js";

// Root directory for all TCK fixture files.
const TCK_ROOT = path.resolve(
  import.meta.dirname,
  "../../vendor/asciidoc-tck/tests",
);

function readFixture(relativePath: string): string {
  return readFileSync(path.resolve(TCK_ROOT, relativePath), "utf8");
}

function readExpected(relativePath: string): unknown {
  return JSON.parse(readFixture(relativePath)) as unknown;
}

// Parses input and converts to ASG, then compares against the
// expected TCK output. The fixture path is relative to the TCK
// root and excludes the -input.adoc / -output.json suffixes.
function expectTCK(fixturePath: string): void {
  const input = readFixture(`${fixturePath}-input.adoc`);
  const expected = readExpected(`${fixturePath}-output.json`);
  const document = parse(input);
  const actual = structuredClone(toASG(document));
  expect(actual).toStrictEqual(expected);
}

// Inline-only variant: parses the first paragraph's inlines
// and compares against the expected inlines array (inline TCK
// fixtures return a bare array, not a document wrapper).
function expectTCKInlines(fixturePath: string): void {
  const input = readFixture(`${fixturePath}-input.adoc`);
  const expected = readExpected(`${fixturePath}-output.json`);
  const { children } = parse(input);
  const [paragraph] = children;
  if (paragraph.type !== "paragraph") {
    throw new Error(`Expected paragraph, got ${paragraph.type}`);
  }
  const actual = structuredClone(toASGInlines(paragraph.children));
  expect(actual).toStrictEqual(expected);
}

// ---------------------------------------------------------------
// Block-level TCK conformance tests
// ---------------------------------------------------------------

describe("TCK conformance: block/paragraph", () => {
  // Single-line paragraph produces one paragraph block with
  // a single text inline whose value is the full line.
  test("single-line", () => {
    expectTCK("block/paragraph/single-line");
  });

  // A paragraph spanning multiple source lines joins them
  // with \n in the text value (preserving line structure).
  test("multiple-lines", () => {
    expectTCK("block/paragraph/multiple-lines");
  });

  // Two paragraphs separated by a blank line produce two
  // sibling paragraph blocks in the document body.
  test("sibling-paragraphs", () => {
    expectTCK("block/paragraph/sibling-paragraphs");
  });

  // Multiple blank lines between paragraphs are equivalent
  // to a single blank line — same two-paragraph output.
  test("paragraph-empty-lines-paragraph", () => {
    expectTCK("block/paragraph/paragraph-empty-lines-paragraph");
  });
});

describe("TCK conformance: block/document", () => {
  // A document with only body text (no `= Title` header)
  // has no header or attributes in the ASG.
  test("body-only", () => {
    expectTCK("block/document/body-only");
  });

  // A document with `= Title` followed by body text
  // produces a header with title inlines and an empty
  // attributes object.
  test("header-body", () => {
    expectTCK("block/document/header-body");
  });
});

describe("TCK conformance: block/section", () => {
  // `== Section Title` followed by a paragraph produces a
  // section at level 1 containing that paragraph. The section
  // location spans from the heading through its last child.
  test("title-body", () => {
    expectTCK("block/section/title-body");
  });
});

describe("TCK conformance: block/list", () => {
  // A single `* item` produces a list block with variant
  // "unordered", marker "*", and one listItem.
  test("unordered/single-item", () => {
    expectTCK("block/list/unordered/single-item");
  });
});

describe("TCK conformance: block/listing", () => {
  // A `----` delimited listing block preserves its content
  // verbatim as a single text inline with embedded \n.
  test("multiple-lines", () => {
    expectTCK("block/listing/multiple-lines");
  });
});

describe("TCK conformance: block/sidebar", () => {
  // A `****` sidebar containing a list produces a parent
  // block with the list as a child block.
  test("containing-unordered-list", () => {
    expectTCK("block/sidebar/containing-unordered-list");
  });
});

describe("TCK conformance: block/header", () => {
  // Attribute entries below the document title (`:icons: font`,
  // `:toc:`) appear in the ASG as `document.attributes`.
  // No-value entries like `:toc:` map to empty string.
  test("attribute-entries-below-title", () => {
    expectTCK("block/header/attribute-entries-below-title");
  });
});

// ---------------------------------------------------------------
// Inline-level TCK conformance tests
// ---------------------------------------------------------------

describe("TCK conformance: inline/no-markup", () => {
  // Plain text with no inline markup produces a single text
  // inline. The output is a bare inlines array, not a
  // document — inline TCK fixtures test the inline layer
  // independently.
  test("single-word", () => {
    expectTCKInlines("inline/no-markup/single-word");
  });
});

// ---------------------------------------------------------------
// Expected failures: constructs not yet implemented
// ---------------------------------------------------------------

describe("TCK conformance: expected failures", () => {
  // Constrained strong markup (`*s*`) requires the inline
  // parser to recognize formatting spans. Not yet implemented.
  test.todo(
    "inline/span/strong/constrained-single-char" +
      " — requires inline formatting (Tasks 14-16)",
  );
});
