/**
 * Section nesting logic for the AST builder.
 *
 * The grammar parses sections flat — each section heading is just
 * another block. This module converts that flat sequence into a
 * nested tree where deeper sections become children of shallower
 * ones. The algorithm mirrors nestListItems in list-builder.ts:
 * a stack tracks open nesting levels.
 */
import type { BlockNode, SectionNode } from "../ast.js";
import { EMPTY, LAST_ELEMENT } from "../constants.js";

/**
 * Close the innermost open section and attach it to its
 * parent. If a section is still on the stack the finished
 * section becomes that parent's child; otherwise it falls
 * through to the document root. Factored out so that the
 * main loop body and the end-of-input drain phase share
 * identical placement logic — duplicating it would risk
 * the two diverging silently.
 * @param stack - The open-section stack being maintained
 *   by nestSections. Each entry is a section whose
 *   children are still being accumulated. Mutated in
 *   place: the top entry is removed.
 * @param children - Top-level block accumulator for the
 *   document. Finished sections land here when the stack
 *   is empty (i.e. they have no enclosing section).
 */
function popSection(stack: SectionNode[], children: BlockNode[]): void {
  const finished = stack.pop();
  if (finished === undefined) {
    return;
  }
  if (stack.length > EMPTY) {
    stack[stack.length + LAST_ELEMENT].children.push(finished);
  } else {
    children.push(finished);
  }
}

/**
 * Convert a flat block array into a nested section tree.
 * Sections at deeper levels become children of the
 * preceding shallower section (e.g. `== A` then `=== B`
 * produces A containing B). Non-section blocks attach to
 * the deepest open section or the document root.
 * @param flatBlocks - The unstructured block sequence
 *   produced by the CST visitor. The grammar emits all
 *   section headings at the same depth regardless of
 *   their `=` count, so nesting must be reconstructed
 *   here from the level numbers alone.
 * @returns A block array where every section's children
 *   list contains exactly the blocks and sub-sections
 *   that appeared between its heading and the next
 *   heading of equal or lesser level (or end of input).
 */
export function nestSections(flatBlocks: BlockNode[]): BlockNode[] {
  const children: BlockNode[] = [];
  const stack: SectionNode[] = [];

  for (const block of flatBlocks) {
    if (block.type === "section") {
      // Pop sections at the same level or deeper. A heading at
      // level N closes any open section also at level N because
      // two sections at the same level are siblings, not nested.
      // Deeper sections (level > N) are obviously closed too.
      while (
        stack.length > EMPTY &&
        stack[stack.length + LAST_ELEMENT].level >= block.level
      ) {
        popSection(stack, children);
      }
      stack.push(block);
    } else if (stack.length > EMPTY) {
      stack[stack.length + LAST_ELEMENT].children.push(block);
    } else {
      children.push(block);
    }
  }

  // Drain remaining sections from the stack.
  while (stack.length > EMPTY) {
    popSection(stack, children);
  }

  return children;
}
