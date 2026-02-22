import { describe, test, expect } from "vitest";
import { parse } from "../../src/parser.js";

describe("discrete heading parsing", () => {
  // A `[discrete]` attribute list followed by a section heading
  // produces a DiscreteHeadingNode instead of a SectionNode.
  // Discrete headings are standalone — they don't create sections.
  test("[discrete] + == Heading produces a discrete heading", () => {
    const document = parse("[discrete]\n== Heading\n");
    // The attribute list is kept as a separate block (for stacking),
    // and the heading becomes a discreteHeading node.
    expect(document.children).toHaveLength(2);
    expect(document.children[0].type).toBe("blockAttributeList");
    expect(document.children[1].type).toBe("discreteHeading");
    if (document.children[1].type === "discreteHeading") {
      expect(document.children[1].level).toBe(1);
      expect(document.children[1].heading).toBe("Heading");
    }
  });

  // Discrete headings do NOT nest subsequent blocks. A paragraph
  // after a discrete heading should be a sibling, not a child.
  test("discrete heading does not nest subsequent blocks", () => {
    const document = parse("[discrete]\n== Heading\n\nA paragraph.\n");
    expect(document.children).toHaveLength(3);
    expect(document.children[0].type).toBe("blockAttributeList");
    expect(document.children[1].type).toBe("discreteHeading");
    expect(document.children[2].type).toBe("paragraph");
  });

  // Discrete headings work at all section levels (== through ======).
  test("discrete heading at level 2 (===)", () => {
    const document = parse("[discrete]\n=== Level 2\n");
    expect(document.children).toHaveLength(2);
    if (document.children[1].type === "discreteHeading") {
      expect(document.children[1].level).toBe(2);
      expect(document.children[1].heading).toBe("Level 2");
    }
  });

  test("discrete heading at level 3 (====)", () => {
    const document = parse("[discrete]\n==== Level 3\n");
    expect(document.children).toHaveLength(2);
    if (document.children[1].type === "discreteHeading") {
      expect(document.children[1].level).toBe(3);
      expect(document.children[1].heading).toBe("Level 3");
    }
  });

  test("discrete heading at level 5 (======)", () => {
    const document = parse("[discrete]\n====== Level 5\n");
    expect(document.children).toHaveLength(2);
    if (document.children[1].type === "discreteHeading") {
      expect(document.children[1].level).toBe(5);
      expect(document.children[1].heading).toBe("Level 5");
    }
  });

  // A discrete heading inside a section should be a child of that
  // section, not create a new section level.
  test("discrete heading inside a section is a child", () => {
    const document = parse(
      "== Section\n\n[discrete]\n=== Discrete\n\nParagraph.\n",
    );
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("section");
    if (document.children[0].type === "section") {
      // The section should contain: attr list, discrete heading,
      // and paragraph as children.
      expect(document.children[0].children).toHaveLength(3);
      expect(document.children[0].children[0].type).toBe("blockAttributeList");
      expect(document.children[0].children[1].type).toBe("discreteHeading");
      expect(document.children[0].children[2].type).toBe("paragraph");
    }
  });

  // A heading without [discrete] should still parse as a section.
  // This ensures the transformation doesn't break normal sections.
  test("heading without [discrete] is still a section", () => {
    const document = parse("== Normal Section\n");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("section");
  });

  // An attribute list with a value other than "discrete" followed
  // by a section heading should leave the section as-is.
  test("[appendix] + heading is still a section", () => {
    const document = parse("[appendix]\n== Appendix\n");
    expect(document.children).toHaveLength(2);
    expect(document.children[0].type).toBe("blockAttributeList");
    expect(document.children[1].type).toBe("section");
  });
});
