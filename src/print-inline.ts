/**
 * Inline node printing — converts inline AST nodes (text,
 * bold, italic, monospace, highlight, attribute references,
 * links, xrefs, inline anchors, inline images, UI macros,
 * footnotes, passthroughs, and hard line breaks) to Prettier
 * Doc IR.
 *
 * Extracted from the main printer to keep file size within
 * the max-lines lint limit.
 */
import { doc, type AstPath, type Doc } from "prettier";
import type {
  BlockNode,
  DocumentNode,
  InlineNode,
  ListItemNode,
} from "./ast.js";
import {
  linkToSource,
  xrefToSource,
  anchorToSource,
  inlineImageToSource,
  kbdToSource,
  buttonToSource,
  menuToSource,
  footnoteToSource,
  passthroughToSource,
} from "./serialize-inline.js";
import { EMPTY } from "./constants.js";
import { wordsToFillParts } from "./reflow.js";

const {
  builders: { line, literalline },
} = doc;

// Must match the AnyNode union in the main printer exactly.
// Prettier's AstPath<T> is invariant: path.map() and
// path.call() reject a narrower type at the call site, so
// we re-declare the same union here rather than narrowing
// to AstPath<InlineNode>.
type AnyNode = DocumentNode | BlockNode | InlineNode | ListItemNode;
type PrintPath = AstPath<AnyNode>;
type PrintFunction = (path: PrintPath) => Doc;

/**
 * Convert an inline AST node to Prettier Doc IR.
 * Dispatches on node type to produce the correct markup
 * (text reflow, formatting marks, attribute references,
 * links, macros, and hard line breaks).
 * @param node - The inline AST node to render; always an
 *   element of a parent block's or span's `children` array,
 *   dispatched here by the main printer.
 * @param path - Prettier's AstPath at the current inline
 *   node. Must carry the full AnyNode union (not just
 *   InlineNode) because AstPath<T> is invariant — narrowing
 *   it would break path.map() at the call site.
 * @param print - Prettier's recursive print callback;
 *   passed to path.map() to render child inline nodes.
 * @returns Doc IR for the inline node, ready to be composed
 *   into an enclosing fill() or concat by the caller.
 */
export function printInlineNode(
  node: InlineNode,
  path: PrintPath,
  print: PrintFunction,
): Doc {
  switch (node.type) {
    case "text": {
      // Split into words; wordsToFillParts interleaves with
      // `line` so the enclosing fill() can decide where to
      // break. Existing newlines in the source are treated as
      // word separators (reflow), not preserved.
      //
      // Two safety mechanisms in wordsToFillParts prevent
      // reflow from generating AsciiDoc syntax:
      // 1. Words dangerous at line START (e.g. list markers
      //    like `-`, `*`) are merged into the preceding word
      //    group so that fill() breaks BEFORE the pair, never
      //    between them.
      // 2. Words dangerous at line END (bare `+`) are merged
      //    with their successor so fill() breaks BEFORE them,
      //    preventing ` +\n` (hard line break) from appearing.
      //
      // When a text node has leading or trailing whitespace
      // (from inline formatting context, e.g. "This is "
      // before *bold*), we emit `line` at the boundary so
      // adjacent inline marks get proper spacing in fill().
      const words = node.value
        .split(/\s+/v)
        .filter((word) => word.length > EMPTY);
      // All-whitespace text nodes (e.g. " " between adjacent
      // formatting marks) produce no visible output — skip them
      // to avoid doubled line separators from the leading/trailing
      // space logic below.
      if (words.length === EMPTY) {
        return [];
      }
      const parts = wordsToFillParts(words);
      const hasLeadingSpace =
        node.value.length > EMPTY && /^\s/v.test(node.value);
      const hasTrailingSpace =
        node.value.length > EMPTY && /\s$/v.test(node.value);
      if (hasLeadingSpace) {
        parts.unshift(line);
      }
      if (hasTrailingSpace) {
        parts.push(line);
      }
      return parts;
    }
    case "bold":
    case "italic":
    case "monospace": {
      // Constrained marks (`*bold*`) require word boundaries;
      // unconstrained (`**bold**`) work anywhere, including
      // mid-word. The AST preserves which form was used so
      // we round-trip it faithfully instead of normalizing.
      // Computed destructuring picks the single-char mark for
      // the current node type without a separate if/switch.
      const markMap = { bold: "*", italic: "_", monospace: "`" };
      const { [node.type]: singleMark } = markMap;
      const mark = node.constrained ? singleMark : `${singleMark}${singleMark}`;
      // eslint-disable-next-line unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument -- AstPath#map, not Array#map
      const inner = path.map(print, "children");
      return [mark, ...inner, mark];
    }
    case "highlight": {
      // A role attribute gives the span semantic meaning used
      // by CSS, e.g. `[.red]#text#`. The role is written as
      // an inline attribute list immediately before the mark,
      // not as a block attribute list — so it must be emitted
      // inline here, not through the block printer.
      const mark = node.constrained ? "#" : "##";
      const rolePrefix = node.role === undefined ? "" : `[${node.role}]`;
      // eslint-disable-next-line unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument -- AstPath#map, not Array#map
      const inner = path.map(print, "children");
      return [rolePrefix, mark, ...inner, mark];
    }
    // Source-preserved constructs: these nodes are emitted
    // verbatim from the AST without reformatting. Prettier
    // does not reflow them because their internal syntax
    // (URLs, target IDs, key combos, menu paths, etc.) is
    // opaque to the printer — changing whitespace or line
    // breaks would alter semantics or break rendering.
    case "attributeReference": {
      return `{${node.name}}`;
    }
    case "link": {
      return linkToSource(node);
    }
    case "xref": {
      return xrefToSource(node);
    }
    case "inlineAnchor": {
      return anchorToSource(node);
    }
    case "inlineImage": {
      return inlineImageToSource(node);
    }
    case "kbd": {
      return kbdToSource(node);
    }
    case "btn": {
      return buttonToSource(node);
    }
    case "menu": {
      return menuToSource(node);
    }
    case "footnote": {
      return footnoteToSource(node);
    }
    case "passthrough": {
      return passthroughToSource(node);
    }
    case "hardLineBreak": {
      // ` +` followed by a forced line break in the output.
      // Use literalline (not hardline) so the break resets
      // to column 0 regardless of any enclosing align()
      // context — e.g. inside list items where align() is
      // used for soft-wrap continuation indentation.
      return [" +", literalline];
    }
  }
}
