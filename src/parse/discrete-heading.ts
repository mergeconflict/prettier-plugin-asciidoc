/**
 * Post-parse transformation: discrete headings.
 *
 * When a `BlockAttributeListNode` with `value === "discrete"`
 * immediately precedes a `SectionNode`, the section is converted
 * to a `DiscreteHeadingNode`. Discrete headings are standalone —
 * they don't create sections and don't nest subsequent blocks.
 *
 * The attribute list node is kept as a separate sibling so the
 * printer's stacking behavior places it on the line before the
 * heading.
 *
 * This transformation must run on the flat block array BEFORE
 * section nesting (`nestSections`), so the section-to-be-converted
 * is never used as a nesting target.
 */
import type {
  BlockAttributeListNode,
  BlockNode,
  DiscreteHeadingNode,
  SectionNode,
} from "../ast.js";
import { FIRST, NEXT, PAIR_LENGTH } from "../constants.js";

/**
 * Isolated predicate so the guard condition in the main scan loop
 * stays readable — the attribute value comparison is one call rather
 * than an inline string literal.
 * @param node - The attribute list node immediately preceding the
 *   candidate section. Its `value` is the raw bracket content,
 *   e.g. `"discrete"`, `"source,ruby"`.
 * @returns True when the attribute value is exactly `"discrete"`,
 *   meaning the following section should be converted.
 */
function isDiscreteAttribute(node: BlockAttributeListNode): boolean {
  return node.value === "discrete";
}

/**
 * Constructs a `DiscreteHeadingNode` from a `SectionNode`. Dropping
 * `children` is the critical step: without it, `nestSections` would
 * treat the node as a container and nest subsequent blocks under it,
 * breaking document structure.
 * @param section - The section node to convert, as it exists in the
 *   flat pre-nesting block array. Its `children` array is always
 *   empty at this stage (nesting has not yet run).
 * @returns A discrete heading carrying the same level, heading text,
 *   and source position as the original section, but with no
 *   `children` field.
 */
function toDiscreteHeading(section: SectionNode): DiscreteHeadingNode {
  return {
    type: "discreteHeading",
    level: section.level,
    heading: section.heading,
    position: section.position,
  };
}

/**
 * Pre-nesting pass that converts `[discrete]` + section pairs
 * into `DiscreteHeadingNode`s. Must run before `nestSections` so
 * that no converted section is ever mistakenly used as a nesting
 * target.
 * @param blocks - Flat block array emitted by the CST builder,
 *   before section nesting collapses it into a tree. Every
 *   `SectionNode` at this stage is still a direct child of the
 *   document or parent block.
 * @returns A new flat array with each `[discrete]` + section pair
 *   replaced by the original attribute list node followed by a
 *   `DiscreteHeadingNode`. All other blocks pass through unchanged.
 */
export function convertDiscreteHeadings(blocks: BlockNode[]): BlockNode[] {
  const result: BlockNode[] = [];
  let index = FIRST;

  while (index < blocks.length) {
    const { [index]: current } = blocks;

    // When a `[discrete]` attribute list is immediately followed by
    // a section, convert that section in-place. The attribute list
    // is kept as a sibling so the printer stacks it above the heading.
    if (current.type === "blockAttributeList" && index + NEXT < blocks.length) {
      const { [index + NEXT]: next } = blocks;
      if (next.type === "section" && isDiscreteAttribute(current)) {
        // Emit the attribute list as a sibling, then the converted heading.
        result.push(current, toDiscreteHeading(next));

        // Skip past both the attribute list and section.
        index += PAIR_LENGTH;
        continue;
      }
    }

    result.push(current);
    index += NEXT;
  }

  return result;
}
