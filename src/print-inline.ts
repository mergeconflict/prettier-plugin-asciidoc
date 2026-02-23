/**
 * Inline node printing — converts inline AST nodes (text,
 * bold, italic, monospace, highlight, attribute references)
 * to Prettier Doc IR.
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
import { EMPTY } from "./constants.js";
import { wordsToFillParts } from "./reflow.js";

const {
  builders: { line },
} = doc;

// Must match the AnyNode union from the main printer so
// Prettier's invariant AstPath<T> accepts our path parameter.
type AnyNode = DocumentNode | BlockNode | InlineNode | ListItemNode;
type PrintPath = AstPath<AnyNode>;
type PrintFunction = (path: PrintPath) => Doc;

// Prints an inline node (text, bold, italic, monospace,
// highlight, or attribute reference).
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
      // word separators (reflow), not preserved. Words that
      // would become block syntax at line start are glued to
      // their predecessor to prevent reflow from altering the
      // document's AST.
      //
      // When a text node has leading or trailing whitespace
      // (from inline formatting context, e.g. "This is "
      // before *bold*), we emit `line` at the boundary so
      // adjacent inline marks get proper spacing in fill().
      const words = node.value
        .split(/\s+/v)
        .filter((word) => word.length > EMPTY);
      // All-whitespace text produces no output — the
      // printer drops it so blank/space-only lines
      // don't turn into spurious newlines.
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
      const markMap = { bold: "*", italic: "_", monospace: "`" };
      const { [node.type]: singleMark } = markMap;
      const mark = node.constrained ? singleMark : `${singleMark}${singleMark}`;
      // eslint-disable-next-line unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument -- AstPath#map, not Array#map
      const inner = path.map(print, "children");
      return [mark, ...inner, mark];
    }
    case "highlight": {
      const mark = node.constrained ? "#" : "##";
      const rolePrefix = node.role === undefined ? "" : `[${node.role}]`;
      // eslint-disable-next-line unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument -- AstPath#map, not Array#map
      const inner = path.map(print, "children");
      return [rolePrefix, mark, ...inner, mark];
    }
    case "attributeReference": {
      return `{${node.name}}`;
    }
  }
}
