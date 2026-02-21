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

// Check whether an attribute list node has the `discrete` style.
function isDiscreteAttribute(
  node: BlockAttributeListNode,
): boolean {
  return node.value === "discrete";
}

// Convert a SectionNode into a DiscreteHeadingNode by dropping
// the children array (discrete headings don't nest content).
function toDiscreteHeading(
  section: SectionNode,
): DiscreteHeadingNode {
  return {
    type: "discreteHeading",
    level: section.level,
    heading: section.heading,
    position: section.position,
  };
}

/**
 * Scan the flat block array for `[discrete]` + section pairs
 * and convert them to discrete heading nodes.
 */
export function convertDiscreteHeadings(
  blocks: BlockNode[],
): BlockNode[] {
  const result: BlockNode[] = [];
  let index = FIRST;

  while (index < blocks.length) {
    const { [index]: current } = blocks;

    // When a block attribute list with value "discrete" is
    // followed by a section, convert the section to a discrete
    // heading. The attribute list is preserved as metadata.
    if (
      current.type === "blockAttributeList" &&
      index + NEXT < blocks.length
    ) {
      const { [index + NEXT]: next } = blocks;
      if (next.type === "section" && isDiscreteAttribute(current)) {
        // Keep the attribute list as metadata and replace the
        // section with a discrete heading.
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
