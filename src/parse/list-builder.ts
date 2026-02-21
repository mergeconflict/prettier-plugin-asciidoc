/**
 * List nesting logic for the AST builder.
 *
 * The grammar parses list items flat — each `listItem` rule just
 * captures a marker and text. This module converts that flat
 * sequence into a nested tree of ListNode/ListItemNode based on
 * marker depth (number of `*` characters).
 *
 * The algorithm mirrors nestSections in ast-builder.ts: a stack
 * tracks open nesting levels, and items are pushed/popped as the
 * depth changes.
 */
import type {
  ListNode,
  ListItemNode,
  TextNode,
  Location,
} from "../ast.js";
import { EMPTY, FIRST, LAST_ELEMENT } from "../constants.js";
// When draining the nesting stack, stop when only the root level
// remains (stack has one entry).
const MIN_STACK_DEPTH = 1;

/**
 * Intermediate representation for a flat list item before nesting.
 * Produced by the AST builder's `listItem` visitor; consumed by
 * `nestListItems` to build the nested tree.
 */
export interface FlatListItem {
  depth: number;
  value: string;
  /** Checkbox state for checklist items (`undefined` = none). */
  checkbox: "checked" | "unchecked" | undefined;
  /** Callout number (`undefined` = not a callout item, 0 = auto). */
  calloutNumber: number | undefined;
  start: Location;
  end: Location;
  textStart: Location;
  textEnd: Location;
}

// One level on the nesting stack. Tracks the list items being
// collected at a particular depth and which parent item they
// will be nested under when the level is popped.
interface NestingLevel {
  depth: number;
  items: ListItemNode[];
  parentItem: FlatListItem | undefined;
}

// Builds a TextNode for a list item's text content.
function buildListItemTextNode(item: FlatListItem): TextNode {
  return {
    type: "text",
    value: item.value,
    position: { start: item.textStart, end: item.textEnd },
  };
}

// Builds a ListItemNode from a flat item (no nested children yet).
function buildListItemNode(item: FlatListItem): ListItemNode {
  return {
    type: "listItem",
    depth: item.depth,
    checkbox: item.checkbox,
    calloutNumber: item.calloutNumber,
    children: [buildListItemTextNode(item)],
    position: { start: item.start, end: item.end },
  };
}

// Builds a ListNode wrapping the given items.
function buildListNode(
  items: ListItemNode[],
  variant: ListNode["variant"],
): ListNode {
  const [first] = items;
  const last = items.at(LAST_ELEMENT) ?? first;
  return {
    type: "list",
    variant,
    children: items,
    position: {
      start: first.position.start,
      end: last.position.end,
    },
  };
}

// Returns the topmost level on the nesting stack.
function topLevel(stack: NestingLevel[]): NestingLevel {
  return stack[stack.length + LAST_ELEMENT];
}

// Pops the topmost nesting level and attaches its items as a
// nested list on the parent item in the level below. This is
// the core operation when ascending from a deeper nesting depth.
// Appends a nested list to a parent item and extends the parent's
// end position to cover the nested children.
function attachNestedList(
  parent: ListItemNode,
  nested: ListNode,
): void {
  parent.children.push(nested);
  // Use Object.assign to update the end position without triggering
  // the no-param-reassign lint rule for property assignment.
  Object.assign(parent.position, { end: nested.position.end });
}

// Pops the topmost nesting level and attaches its items as a
// nested list on the last item of the level below.
//
// Callers guarantee two preconditions that make defensive checks
// unnecessary:
// 1. stack.length ≥ 2 (both call sites guard with
//    `stack.length > MIN_STACK_DEPTH`), so pop() always
//    returns a value and a parent level always exists.
// 2. Every pushed level receives at least one item in the same
//    loop iteration before it can be popped, so the items
//    array is never empty.
function collapseLevel(
  stack: NestingLevel[],
  variant: ListNode["variant"],
): void {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- precondition: stack.length ≥ 2
  const finished = stack.pop()!;
  const nestedList = buildListNode(finished.items, variant);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- precondition: parent level has items
  const parentListItem = topLevel(stack).items.at(LAST_ELEMENT)!;
  attachNestedList(parentListItem, nestedList);
}


/**
 * Nests flat list items into a tree of ListNode/ListItemNode based
 * on depth. Uses a stack-based algorithm similar to nestSections:
 * - Same depth: sibling in current list
 * - Deeper: start a new nested list under the previous item
 * - Shallower: pop back up and add sibling at the right level
 */
export function nestListItems(
  flatItems: FlatListItem[],
  variant: ListNode["variant"] = "unordered",
): ListNode {
  const firstDepth =
    flatItems.length > EMPTY ? flatItems[FIRST].depth : FIRST;
  const stack: NestingLevel[] = [
    { depth: firstDepth, items: [], parentItem: undefined },
  ];

  let previousFlatItem: FlatListItem | undefined = undefined;

  for (const flatItem of flatItems) {
    // Pop deeper levels — they're finished. We stop at
    // MIN_STACK_DEPTH (not EMPTY) because the root level
    // should never be popped — collapseLevel needs a parent
    // to attach the nested list to.
    while (
      stack.length > MIN_STACK_DEPTH &&
      topLevel(stack).depth > flatItem.depth
    ) {
      collapseLevel(stack, variant);
    }

    // Going deeper — push a new nesting level.
    if (
      topLevel(stack).depth < flatItem.depth
    ) {
      stack.push({
        depth: flatItem.depth,
        items: [],
        parentItem: previousFlatItem,
      });
    }

    // Add item as sibling at the current level.
    topLevel(stack).items.push(buildListItemNode(flatItem));
    previousFlatItem = flatItem;
  }

  // Drain nested levels back to root.
  while (stack.length > MIN_STACK_DEPTH) {
    collapseLevel(stack, variant);
  }

  const [root] = stack;
  return buildListNode(root.items, variant);
}
