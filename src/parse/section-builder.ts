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

// Pops the top section from the stack and places it either as a
// child of the new stack top (if one exists) or into the document's
// top-level children. Extracted to avoid duplicating the pop-and-place
// logic in the loop body and the drain phase of nestSections.
function popSection(
  stack: SectionNode[],
  children: BlockNode[],
): void {
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

// Stack-based hierarchical nesting: sections at deeper levels become
// children of the preceding shallower section. For example, `== A`
// then `=== B` produces section A containing section B. The stack
// tracks open sections from shallowest (bottom) to deepest (top).
// When a new section arrives, we pop all sections at same level or
// deeper — they're complete — then push the new section. Non-section
// blocks go into the deepest open section (or document root).
export function nestSections(flatBlocks: BlockNode[]): BlockNode[] {
  const children: BlockNode[] = [];
  const stack: SectionNode[] = [];

  for (const block of flatBlocks) {
    if (block.type === "section") {
      // Pop sections at same level or deeper — they're finished.
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
