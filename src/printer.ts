/**
 * Prettier printer for AsciiDoc AST → Doc IR.
 *
 * The printer walks our AST and produces Prettier's Doc IR (intermediate
 * representation). Prettier then converts the Doc IR to formatted text.
 *
 * Formatting opinions applied here:
 * - Paragraph text is reflowed to printWidth using fill.
 *   (Whitespace — including newlines — is normalized to single
 *   spaces between words; fill decides where to break.)
 * - Blocks separated by exactly one blank line
 *   (join with [hardline, hardline]).
 * - Documents end with exactly one trailing newline
 *   (hardline after last child).
 * - Empty documents produce empty output (no trailing newline).
 *
 * TODO: Reflow treats all paragraph text as prose. Constructs
 * the parser doesn't yet recognise (block macros, tables,
 * etc.) are parsed as paragraphs and will be incorrectly
 * reflowed. This resolves as those constructs get their own
 * AST nodes.
 */
import { doc, type AstPath, type Printer, type Doc } from "prettier";
import type {
  AdmonitionNode,
  DocumentNode,
  BlockNode,
  DelimitedBlockNode,
  ParentBlockNode,
  InlineNode,
  ListItemNode,
  ListNode,
} from "./ast.js";
import {
  EMPTY,
  MARKER_OFFSET,
  MIN_DELIMITER_LENGTH,
  SAFE_DELIMITER_PAD,
} from "./constants.js";

const {
  builders: { align, fill, hardline, join, line },
} = doc;
// Index of the second child in a block array. Also serves as
// the loop increment in joinBlocks — both uses mean "one step
// from the previous element", so the same constant applies.
const SECOND_CHILD = 1;

// Line comments and attribute entries are special cases for block
// separation: consecutive elements of either type should appear on
// adjacent lines, not separated by a blank line like other block
// elements. This matches idiomatic AsciiDoc style.
function isLineComment(block: BlockNode): boolean {
  return block.type === "comment" && block.commentType === "line";
}

function isAttributeEntry(block: BlockNode): boolean {
  return block.type === "attributeEntry";
}

function isDocumentTitle(block: BlockNode): boolean {
  return block.type === "documentTitle";
}

// Block metadata (attribute lists, anchors, titles) stacks with
// the following block — no blank line between them. This matches
// idiomatic AsciiDoc where `[source,ruby]` sits directly above
// `----` with no intervening blank line.
function isBlockMetadata(block: BlockNode): boolean {
  return (
    block.type === "blockAttributeList" ||
    block.type === "blockAnchor" ||
    block.type === "blockTitle"
  );
}

// Checks whether the block at `index` and the one before it should be
// stacked on adjacent lines (single newline, no blank line). This
// applies to:
// - Consecutive line comments (idiomatic stacking)
// - Consecutive attribute entries (idiomatic stacking)
// - Document title followed by attribute entry (the contiguous
//   header pattern: `= Title` then `:attr: value` with no blank line)
// The reverse (attribute entry before title) is intentionally absent:
// in AsciiDoc, attributes follow the title — they never precede it.
//
// Lists always get a blank-line separator — no stacking conditions
// needed for list nodes. If future block types (delimited blocks,
// tables) introduce more stacking patterns, consider switching
// to a node property (e.g. `stackable`) instead of pairwise checks.
function shouldStack(blocks: BlockNode[], index: number): boolean {
  const { [index - SECOND_CHILD]: previous, [index]: current } = blocks;
  return (
    (isLineComment(previous) && isLineComment(current)) ||
    (isAttributeEntry(previous) && isAttributeEntry(current)) ||
    (isDocumentTitle(previous) && isAttributeEntry(current)) ||
    // Block metadata (attribute lists, anchors, titles) stacks
    // with each other and with the block that follows them.
    // The previous node being metadata means this node should be
    // on an adjacent line regardless of what it is.
    isBlockMetadata(previous)
  );
}

// Joins printed block children with appropriate separators.
// Consecutive line comments get a single newline; all other
// adjacent pairs get a blank line (double hardline).
function joinBlocks(blocks: BlockNode[], printed: Doc[]): Doc {
  const result: Doc[] = [printed[EMPTY]];
  for (
    let index = SECOND_CHILD;
    index < printed.length;
    index += SECOND_CHILD
  ) {
    // Stacked blocks (consecutive comments, consecutive attribute
    // entries, or document title + attribute entry in a header)
    // use a single newline. All other pairs get a blank line.
    const separator: Doc =
      shouldStack(blocks, index) ? hardline : [hardline, hardline];
    result.push(separator, printed[index]);
  }
  return result;
}

// Prints a comment node to Doc IR. Extracted from the main print
// method to keep cyclomatic complexity manageable as more node
// types are added.
function printComment(node: {
  commentType: "line" | "block";
  value: string;
}): Doc {
  if (node.commentType === "line") {
    if (node.value.length > EMPTY) {
      return ["// ", node.value];
    }
    return "//";
  }
  // Block comment: delimiters on their own lines, content verbatim.
  if (node.value.length > EMPTY) {
    const contentLines = node.value.split("\n");
    return [
      "////",
      hardline,
      join(hardline, contentLines),
      hardline,
      "////",
    ];
  }
  return ["////", hardline, "////"];
}

// Leaf-block variants that use delimiter characters (----,
// ...., ++++). Other variants (example, sidebar, quote, verse)
// only appear in paragraph form and don't need delimiters in
// this map — they're handled before reaching the delimiter
// lookup in printDelimitedBlock.
type LeafBlockVariant = "listing" | "literal" | "pass";

// Maps each leaf-block variant to its single delimiter character.
// Used by the printer to compute the minimum safe delimiter length
// and build the output delimiter string.
const DELIMITER_CHARS: Record<LeafBlockVariant, string> = {
  listing: "-",
  literal: ".",
  pass: "+",
};

// Computes the shortest delimiter that won't conflict with
// any line in the block's content. Scans for lines that
// consist entirely of the delimiter character (4+ chars)
// and returns a delimiter one character longer than the
// longest conflict. Returns the minimum 4-char delimiter
// when no conflicts exist.
function computeDelimiter(
  content: string,
  delimChar: string,
): string {
  let maxConflict = EMPTY;
  if (content.length > EMPTY) {
    // Escape the delimiter char for use in a regex.
    // `.` and `+` are regex metacharacters; `-` is safe
    // outside character classes and must NOT be escaped
    // (the `v` flag rejects unnecessary escapes).
    const escaped = delimChar.replace(/[.+]/v, String.raw`\$&`);
    const pattern = new RegExp(
      `^${escaped}{${MIN_DELIMITER_LENGTH},}$`,
      "v",
    );
    for (const line of content.split("\n")) {
      if (pattern.test(line)) {
        maxConflict = Math.max(maxConflict, line.length);
      }
    }
  }
  const length = Math.max(
    MIN_DELIMITER_LENGTH,
    maxConflict + SAFE_DELIMITER_PAD,
  );
  return delimChar.repeat(length);
}

// Prints a delimited leaf block: delimiter, content lines
// (verbatim), delimiter. Content is not reflowed — it's
// preserved exactly. The delimiter length is computed by
// `computeDelimiter` to avoid conflicts with content.
// For indented literal paragraphs (form: "indented"), the
// content lines are printed verbatim without delimiters.
function printDelimitedBlock(node: DelimitedBlockNode): Doc {
  // Indented literal paragraphs and paragraph-form blocks: print
  // content verbatim without delimiters. The preceding attribute
  // list (for paragraph form) is a separate node handled by the
  // printer's stacking behavior.
  if (node.form === "indented" || node.form === "paragraph") {
    const contentLines = node.content.split("\n");
    return join(hardline, contentLines);
  }

  // After the early return above, only delimited-form leaf blocks
  // remain (listing, literal, pass). TypeScript needs the assertion
  // because it can't narrow via the `form` check.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- narrowed by form check above
  const variant = node.variant as LeafBlockVariant;
  const { [variant]: delimChar } = DELIMITER_CHARS;
  const delimiter = computeDelimiter(node.content, delimChar);
  if (node.content.length > EMPTY) {
    const contentLines = node.content.split("\n");
    return [
      delimiter,
      hardline,
      join(hardline, contentLines),
      hardline,
      delimiter,
    ];
  }
  return [delimiter, hardline, delimiter];
}

// Maps each parent block variant to its delimiter character and
// default length. Open blocks always use exactly 2 dashes.
const PARENT_DELIMITER_CHARS: Record<
  ParentBlockNode["variant"],
  string
> = {
  example: "=",
  sidebar: "*",
  open: "-",
  quote: "_",
};

// Open block delimiter is always exactly 2 dashes.
const OPEN_BLOCK_DELIMITER_LENGTH = 2;

// Prints a delimited parent block: delimiter, children
// (formatted blocks), delimiter. Children are joined with
// blank line separators using the same joinBlocks logic as
// the document level.
function printParentBlock(
  node: ParentBlockNode,
  path: PrintPath,
  print: PrintFunction,
): Doc {
  const { [node.variant]: delimChar } = PARENT_DELIMITER_CHARS;
  const delimLength =
    node.variant === "open"
      ? OPEN_BLOCK_DELIMITER_LENGTH
      : MIN_DELIMITER_LENGTH;
  const delimiter = delimChar.repeat(delimLength);

  if (node.children.length > EMPTY) {
    // eslint-disable-next-line unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument -- AstPath#map, not Array#map
    const children = path.map(print, "children");
    return [
      delimiter,
      hardline,
      joinBlocks(node.children, children),
      hardline,
      delimiter,
    ];
  }
  return [delimiter, hardline, delimiter];
}

// Prints an admonition node to Doc IR.
//
// Paragraph-form admonitions: `NOTE: text` — the label prefix is
// followed by reflowed text using fill() (same as paragraphs).
//
// Delimited-form admonitions: printed as the parent block
// delimiters wrapping the children. The `[NOTE]` attribute list
// that precedes the block is a separate metadata node handled by
// the stacking behavior in joinBlocks.
function printAdmonition(
  node: AdmonitionNode,
  path: PrintPath,
  print: PrintFunction,
): Doc {
  if (node.form === "paragraph") {
    const label = `${node.variant.toUpperCase()}: `;
    if (node.content === undefined) {
      return label.trimEnd();
    }
    // Reflow the content into fill() the same way paragraphs
    // do. Split on whitespace, interleave with line breaks.
    const words = node.content
      .split(/\s+/v)
      .filter((word) => word.length > EMPTY);
    const parts: Doc[] = [];
    for (const [index, word] of words.entries()) {
      if (index > EMPTY) {
        parts.push(line);
      }
      parts.push(word);
    }
    // Indent continuation lines to align with the text after
    // the label prefix, so wrapped lines start under the first
    // word rather than at column 0.
    return [label, align(label.length, fill(parts))];
  }

  // Delimited form: use the stored delimiter variant to
  // reconstruct the correct delimiters (example `====` or
  // open `--`).
  const delimVariant = node.delimiter ?? "example";
  const { [delimVariant]: delimChar } = PARENT_DELIMITER_CHARS;
  const delimLength =
    delimVariant === "open"
      ? OPEN_BLOCK_DELIMITER_LENGTH
      : MIN_DELIMITER_LENGTH;
  const delimiter = delimChar.repeat(delimLength);

  if (node.children.length > EMPTY) {
    // eslint-disable-next-line unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument -- AstPath#map, not Array#map
    const children = path.map(print, "children");
    return [
      delimiter,
      hardline,
      joinBlocks(node.children, children),
      hardline,
      delimiter,
    ];
  }
  return [delimiter, hardline, delimiter];
}

// Prints an attribute entry node to Doc IR.
function printAttributeEntry(node: {
  name: string;
  value: string | undefined;
  unset: false | "prefix" | "suffix";
}): Doc {
  const bangPrefix = node.unset === "prefix" ? "!" : "";
  const bangSuffix = node.unset === "suffix" ? "!" : "";
  if (node.value !== undefined) {
    return [":", bangPrefix, node.name, bangSuffix, ": ", node.value];
  }
  return [":", bangPrefix, node.name, bangSuffix, ":"];
}

// Union of all node types the printer may encounter. Prettier's generic Printer
// type needs this to type-check path.map() calls across different node shapes.
type AnyNode = DocumentNode | BlockNode | InlineNode | ListItemNode;

// Convenience aliases for the printer callback types so helper
// functions can accept the same path/print arguments as the main
// print method without repeating verbose generic types.
type PrintPath = AstPath<AnyNode>;
type PrintFunction = (path: PrintPath) => Doc;

// Prints a list node: each item separated by a hard line break.
// Items at different depths are handled by the nested ListNode
// structure — each ListItemNode prints its own nested children.
function printList(path: PrintPath, print: PrintFunction): Doc {
  // eslint-disable-next-line unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument -- AstPath#map, not Array#map
  const items = path.map(print, "children");
  return join(hardline, items);
}

// Builds the marker string for a list item based on the parent
// list's variant. Callout lists use `<N>` or `<.>` markers;
// ordered lists use dots; unordered lists use asterisks.
function buildMarker(
  node: ListItemNode,
  parentList: ListNode | undefined,
): string {
  if (parentList?.variant === "callout") {
    // Auto-numbered callouts store 0 as calloutNumber.
    const calloutLabel =
      node.calloutNumber === EMPTY
        ? "."
        : String(node.calloutNumber);
    return `<${calloutLabel}>`;
  }
  const markerChar =
    parentList?.variant === "ordered" ? "." : "*";
  return markerChar.repeat(node.depth);
}

// Prints a single list item: marker + space + text content,
// with text reflowed via fill. Nested lists appear on the next
// line after the item text.
function printListItem(
  node: ListItemNode,
  path: PrintPath,
  print: PrintFunction,
): Doc {
  // Determine the marker character from the parent list's variant.
  // The parent is always a ListNode (items live inside lists).
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Prettier path traversal returns generic node
  const parentList = path.getParentNode() as ListNode | undefined;
  // Build the list marker string. Callout lists use `<N>` or
  // `<.>` markers; ordered use dots; unordered use asterisks.
  const marker = buildMarker(node, parentList);

  // For checklist items, insert the checkbox marker between the
  // list marker and the text. Normalize [*] to [x] (canonical).
  const checkboxPrefix =
    node.checkbox === "checked"
      ? "[x] "
      : (node.checkbox === "unchecked"
          ? "[ ] "
          : "");

  // Continuation lines should align with the text start, which
  // is marker width + 1 space after the marker character(s).
  const markerWidth = marker.length + MARKER_OFFSET;

  // eslint-disable-next-line unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument -- AstPath#map, not Array#map
  const printed = path.map(print, "children");

  // Build the output by walking AST children and their
  // corresponding printed Doc IR in parallel.
  //
  // The flatMap produces a Doc array shaped like:
  //   [fill(marker, " ", ...words...), hardline, nestedListDoc]
  // where the fill handles text reflow and any nested list
  // follows on its own line after a hardline break.
  return node.children.flatMap((child, index) => {
    const { [index]: printedChild } = printed;
    if (child.type === "text") {
      // Reflow item text using fill, same as paragraphs. The
      // printed text node is an array of words interleaved with
      // `line`; we prepend the marker and flatten into fill().
      // Wrap in align() so continuation lines are indented to
      // align with the text start (after the marker + space).
      const flatText = Array.isArray(printedChild)
        ? (printedChild as Doc[])
        : [printedChild];
      return [
        fill([
          marker, " ", checkboxPrefix,
          align(markerWidth, fill(flatText)),
        ]),
      ];
    }
    // Nested list: appears on the next line.
    return [hardline, printedChild];
  });
}

const printer: Printer<AnyNode> = {
  print(path, _options, print): Doc {
    const { node } = path;

    switch (node.type) {
      case "document": {
        // eslint-disable-next-line unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument -- AstPath#map, not Array#map
        const children = path.map(print, "children");
        if (node.children.length > EMPTY) {
          return [joinBlocks(node.children, children), hardline];
        }
        return "";
      }
      case "documentTitle": {
        return ["= ", node.title];
      }
      case "section": {
        const marker = "=".repeat(node.level + MARKER_OFFSET);
        const headingContent: Doc = [marker, " ", node.heading];
        if (node.children.length > EMPTY) {
          // eslint-disable-next-line unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument -- AstPath#map, not Array#map
          const sectionChildren = path.map(print, "children");
          return [
            headingContent,
            hardline,
            hardline,
            joinBlocks(node.children, sectionChildren),
          ];
        }
        return headingContent;
      }
      case "discreteHeading": {
        const marker = "=".repeat(node.level + MARKER_OFFSET);
        return [marker, " ", node.heading];
      }
      case "comment": {
        return printComment(node);
      }
      case "attributeEntry": {
        return printAttributeEntry(node);
      }
      case "blockAttributeList": {
        return ["[", node.value, "]"];
      }
      case "blockAnchor": {
        return node.reftext === undefined
          ? ["[[", node.id, "]]"]
          : ["[[", node.id, ", ", node.reftext, "]]"];
      }
      case "blockTitle": {
        return [".", node.title];
      }
      case "delimitedBlock": {
        return printDelimitedBlock(node);
      }
      case "parentBlock": {
        return printParentBlock(node, path, print);
      }
      case "admonition": {
        return printAdmonition(node, path, print);
      }
      // Normalize breaks to the canonical three-character form
      // regardless of how many characters the source used
      // (`''''` → `'''`, `<<<<<` → `<<<`).
      case "thematicBreak": {
        return "'''";
      }
      case "pageBreak": {
        return "<<<";
      }
      case "paragraph": {
        // Reflow paragraph text to printWidth using fill. The text
        // children produce word/line pairs; fill packs as many words
        // as possible onto each line before wrapping.
        // eslint-disable-next-line unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument, unicorn/prefer-array-flat-map -- AstPath#map, not Array#map; AstPath has no flatMap
        return fill(path.map(print, "children").flat());
      }
      case "list": {
        return printList(path, print);
      }
      case "listItem": {
        return printListItem(node, path, print);
      }
      case "text": {
        // Split into words and interleave with `line` so the
        // enclosing fill() can decide where to break. Existing
        // newlines in the source are treated as word separators
        // (reflow), not preserved.
        const words = node.value
          .split(/\s+/v)
          .filter((word) => word.length > EMPTY);
        const parts: Doc[] = [];
        for (const [index, word] of words.entries()) {
          if (index > EMPTY) {
            parts.push(line);
          }
          parts.push(word);
        }
        return parts;
      }
    }
  },
};

export default printer;
