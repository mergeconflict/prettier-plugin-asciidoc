import { describe, test, expect } from "vitest";
import { parse } from "../../src/parser.js";
import { unreachable } from "../../src/unreachable.js";

describe("discrete heading parsing", () => {
  // A `[discrete]` attribute list followed by a section heading
  // produces a DiscreteHeadingNode instead of a SectionNode.
  // Discrete headings are standalone — they don't create sections.
  // Note: levels are zero-indexed, so `==` is level 1 (not 0 or 2),
  // matching the SectionNode.level convention.
  test("[discrete] + == Heading produces a discrete heading", () => {
    const { children } = parse("[discrete]\n== Heading\n");
    // The attribute list is kept as a separate block (for stacking),
    // and the heading becomes a discreteHeading node.
    expect(children).toHaveLength(2);
    expect(children[0].type).toBe("blockAttributeList");
    const [, child1] = children;
    if (child1.type !== "discreteHeading")
      unreachable("expected discreteHeading");
    expect(child1.level).toBe(1);
    expect(child1.heading).toBe("Heading");
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
  // Levels 2, 3, and 5 are tested (non-consecutive) to verify any
  // level converts, not just those adjacent to the base case.
  // Level 4 is intentionally omitted as redundant given 3 and 5.
  test("discrete heading at level 2 (===)", () => {
    const { children } = parse("[discrete]\n=== Level 2\n");
    expect(children).toHaveLength(2);
    const [, child1] = children;
    if (child1.type !== "discreteHeading")
      unreachable("expected discreteHeading");
    expect(child1.level).toBe(2);
    expect(child1.heading).toBe("Level 2");
  });

  // Level 3 (====): one step beyond level 2, still no section nesting.
  test("discrete heading at level 3 (====)", () => {
    const { children } = parse("[discrete]\n==== Level 3\n");
    expect(children).toHaveLength(2);
    const [, child1] = children;
    if (child1.type !== "discreteHeading")
      unreachable("expected discreteHeading");
    expect(child1.level).toBe(3);
    expect(child1.heading).toBe("Level 3");
  });

  // Level 5 (======): the deepest valid heading level.
  test("discrete heading at level 5 (======)", () => {
    const { children } = parse("[discrete]\n====== Level 5\n");
    expect(children).toHaveLength(2);
    const [, child1] = children;
    if (child1.type !== "discreteHeading")
      unreachable("expected discreteHeading");
    expect(child1.level).toBe(5);
    expect(child1.heading).toBe("Level 5");
  });

  // A discrete heading inside a section should be a child of that
  // section, not create a new section level.
  test("discrete heading inside a section is a child", () => {
    const { children } = parse(
      "== Section\n\n[discrete]\n=== Discrete\n\nParagraph.\n",
    );
    expect(children).toHaveLength(1);
    const [child0] = children;
    if (child0.type !== "section") unreachable("expected section");
    // The section should contain: blockAttributeList, discreteHeading,
    // and paragraph as children.
    expect(child0.children).toHaveLength(3);
    expect(child0.children[0].type).toBe("blockAttributeList");
    expect(child0.children[1].type).toBe("discreteHeading");
    expect(child0.children[2].type).toBe("paragraph");
  });

  // A heading without [discrete] should still parse as a section.
  // Verifies that convertDiscreteHeadings() is a no-op when the
  // `[discrete]` attribute is absent — normal section parsing is
  // not disrupted.
  test("heading without [discrete] is still a section", () => {
    const document = parse("== Normal Section\n");
    expect(document.children).toHaveLength(1);
    expect(document.children[0].type).toBe("section");
  });

  // An attribute list whose positional attribute is not "discrete"
  // must not trigger the conversion. `[appendix]` was chosen as a
  // realistic AsciiDoc style (not an invented `[foo]`) to confirm
  // the check is strictly value-equality against "discrete".
  test("[appendix] + heading is still a section", () => {
    const document = parse("[appendix]\n== Appendix\n");
    expect(document.children).toHaveLength(2);
    expect(document.children[0].type).toBe("blockAttributeList");
    expect(document.children[1].type).toBe("section");
  });
});
