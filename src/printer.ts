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
  FIRST,
  MARKER_OFFSET,
  MIN_DELIMITER_LENGTH,
  NEXT,
  SAFE_DELIMITER_PAD,
} from "./constants.js";
import { printInlineNode } from "./print-inline.js";
import { wordsToFillParts } from "./reflow.js";

const {
  builders: { align, fill, hardline, join },
} = doc;
// Index of the second child in a block array. Also serves as
// the loop increment in joinBlocks — both uses mean "one step
// from the previous element", so the same constant applies.
const SECOND_CHILD = 1;

/**
 * Tests whether a block is a line comment.
 *
 * Line comments and attribute entries are special cases
 * for block separation: consecutive elements of either
 * type should appear on adjacent lines, not separated by
 * a blank line like other block elements. This matches
 * idiomatic AsciiDoc style.
 * @param block - The block node to test.
 * @returns Whether the block is a line comment.
 */
function isLineComment(block: BlockNode): boolean {
  return block.type === "comment" && block.commentType === "line";
}

/**
 * Tests whether a block is an attribute entry.
 *
 * Used alongside {@link isLineComment} to determine
 * stacking: consecutive attribute entries appear on
 * adjacent lines without a blank-line separator.
 * @param block - The block node to test.
 * @returns Whether the block is an attribute entry.
 */
function isAttributeEntry(block: BlockNode): boolean {
  return block.type === "attributeEntry";
}

/**
 * Tests whether a block is a document title.
 *
 * Used in stacking logic: a document title followed
 * by attribute entries forms a contiguous header
 * (`= Title` then `:attr: value` with no blank line).
 * @param block - The block node to test.
 * @returns Whether the block is a document title.
 */
function isDocumentTitle(block: BlockNode): boolean {
  return block.type === "documentTitle";
}

/**
 * Tests whether a block is a paragraph whose only child
 * is an inline anchor (`[[id]]`).
 *
 * These act as block metadata when they appear on a
 * standalone line, but unlike true metadata tokens they
 * would merge with a following paragraph on re-parse
 * (breaking idempotency), so stacking needs special
 * treatment.
 * @param block - The block node to test.
 * @returns Whether the block is an anchor-only paragraph.
 */
function isAnchorParagraph(block: BlockNode): boolean {
  return (
    block.type === "paragraph" &&
    block.children.length === NEXT &&
    block.children[FIRST].type === "inlineAnchor"
  );
}

/**
 * Tests whether a block's content would merge with a
 * preceding anchor paragraph if no blank line separated
 * them.
 *
 * Plain paragraphs and paragraph-form admonitions both
 * start with ordinary text that the parser would absorb
 * into the anchor's paragraph on re-parse, breaking
 * idempotency. A blank line must be preserved before
 * these blocks when they follow an anchor paragraph.
 * @param block - The block node to test.
 * @returns Whether this block would merge with a
 *   preceding anchor paragraph.
 */
function wouldMergeWithAnchor(block: BlockNode): boolean {
  return (
    (block.type === "paragraph" && !isAnchorParagraph(block)) ||
    (block.type === "admonition" && block.form === "paragraph")
  );
}

/**
 * Tests whether a block is block metadata (attribute
 * list, block title, or anchor paragraph).
 *
 * Block metadata stacks with the following block — no
 * blank line between them. This matches idiomatic
 * AsciiDoc where `[source,ruby]` sits directly above
 * `----` with no intervening blank line.
 * @param block - The block node to test.
 * @returns Whether the block is block metadata.
 */
function isBlockMetadata(block: BlockNode): boolean {
  return (
    block.type === "blockAttributeList" ||
    block.type === "blockTitle" ||
    isAnchorParagraph(block)
  );
}

/**
 * Checks whether the block at `index` and the one before
 * it should be stacked on adjacent lines (single newline,
 * no blank line).
 *
 * Stacking applies to:
 * - Consecutive line comments (idiomatic stacking)
 * - Consecutive attribute entries (idiomatic stacking)
 * - Document title followed by attribute entry (the
 *   contiguous header pattern: `= Title` then
 *   `:attr: value` with no blank line)
 *
 * The reverse (attribute entry before title) is
 * intentionally absent: in AsciiDoc, attributes follow
 * the title — they never precede it.
 *
 * Lists always get a blank-line separator — no stacking
 * conditions needed for list nodes. If future block types
 * (delimited blocks, tables) introduce more stacking
 * patterns, consider switching to a node property (e.g.
 * `stackable`) instead of pairwise checks.
 * @param blocks - The full array of sibling block nodes.
 * @param index - Index of the current block (must be
 *   at least 1 so the previous block exists).
 * @returns Whether the two blocks should stack without
 *   a blank-line separator.
 */
function shouldStack(blocks: BlockNode[], index: number): boolean {
  const { [index - SECOND_CHILD]: previous, [index]: current } = blocks;
  return (
    (isLineComment(previous) && isLineComment(current)) ||
    (isAttributeEntry(previous) && isAttributeEntry(current)) ||
    (isDocumentTitle(previous) && isAttributeEntry(current)) ||
    // Block metadata (attribute lists, anchors, titles) stacks
    // with each other and with the block that follows them.
    // Exception: anchor paragraphs must NOT stack with plain
    // paragraphs — on re-parse the anchor would merge into the
    // paragraph text, breaking idempotency.
    (isBlockMetadata(previous) &&
      (!isAnchorParagraph(previous) || !wouldMergeWithAnchor(current)))
  );
}

/**
 * Joins printed block children with appropriate
 * separators.
 *
 * Consecutive line comments and other stacked pairs get a
 * single newline; all other adjacent pairs get a blank
 * line (double hardline). This is the central block
 * separation logic — every block-level container routes
 * through here.
 * @param blocks - The original AST block nodes, used to
 *   determine stacking relationships between adjacent
 *   siblings.
 * @param printed - The corresponding Doc IR produced by
 *   printing each block.
 * @returns A single Doc with blocks separated by the
 *   correct number of newlines.
 */
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
    const separator: Doc = shouldStack(blocks, index)
      ? hardline
      : [hardline, hardline];
    result.push(separator, printed[index]);
  }
  return result;
}

/**
 * Prints a comment node to Doc IR.
 *
 * Extracted from the main print method to keep cyclomatic
 * complexity manageable as more node types are added.
 * Line comments produce `// text`; block comments produce
 * `////` delimiters with verbatim content between them.
 * @param node - The comment node.
 * @param node.commentType - Whether this is a line
 *   (`//`) or block (`////`) comment.
 * @param node.value - The text content of the comment.
 * @returns Doc IR for the formatted comment.
 */
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
  // Use trim() to detect whitespace-only content: Prettier strips
  // trailing whitespace per line, so "     " would become a blank
  // line that re-parses as an empty comment, breaking idempotency.
  if (node.value.trim().length > EMPTY) {
    const contentLines = node.value.split("\n");
    return ["////", hardline, join(hardline, contentLines), hardline, "////"];
  }
  return ["////", hardline, "////"];
}

// Leaf-block variants that use their own delimiter characters
// (----, ...., ++++). Other variants (example, sidebar, quote,
// verse) either use parent-block delimiters when masqueraded
// (case 1 of computeMasqueradeDelimiter) or fall through to
// MASQUERADE_DELIMITER_CHARS (case 3).
type LeafBlockVariant = "listing" | "literal" | "pass";

// Maps each leaf-block variant to its single delimiter character.
// Used by the printer to compute the minimum safe delimiter length
// and build the output delimiter string.
const DELIMITER_CHARS: Record<LeafBlockVariant, string> = {
  listing: "-",
  literal: ".",
  pass: "+",
};

// Fallback delimiter chars for variants that are naturally
// associated with parent-block delimiters (verse/quote → `_`,
// example → `=`, sidebar → `*`). Used by
// computeMasqueradeDelimiter when no explicit sourceDelimiter
// is present on the node — e.g. a verse block that was parsed
// directly rather than masqueraded from a parent block.
type MasqueradedVariant = "verse" | "example" | "sidebar" | "quote";
// In practice none of these are currently reachable: verse
// and other masquerade variants always carry `sourceDelimiter`
// when produced by the parser (caught by case 1), or are
// expressed in paragraph form (caught before calling
// computeMasqueradeDelimiter). The entries are present for
// defensive completeness against future parser paths.
const MASQUERADE_DELIMITER_CHARS: Record<MasqueradedVariant, string> = {
  verse: "_",
  quote: "_",
  example: "=",
  sidebar: "*",
};

/**
 * Computes the shortest safe delimiter for a delimited
 * block.
 *
 * Scans the block content for lines that consist entirely
 * of the delimiter character (4+ chars) — these would be
 * misinterpreted as delimiters on re-parse. Returns a
 * delimiter one character longer than the longest
 * conflict. When no conflicts exist, returns the minimum
 * 4-character delimiter.
 * @param content - The verbatim text content of the
 *   block.
 * @param delimChar - The single character used for the
 *   delimiter (e.g. `-` for listing blocks).
 * @returns The delimiter string, repeated to a safe
 *   length.
 */
function computeDelimiter(content: string, delimChar: string): string {
  let maxConflict = EMPTY;
  if (content.length > EMPTY) {
    // Escape the delimiter char for use in a regex.
    // `.` and `+` are regex metacharacters; `-` is safe
    // outside character classes and must NOT be escaped
    // (the `v` flag rejects unnecessary escapes).
    const escaped = delimChar.replace(/[.+]/v, String.raw`\$&`);
    const pattern = new RegExp(`^${escaped}{${MIN_DELIMITER_LENGTH},}$`, "v");
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

/**
 * Resolves the correct delimiter string for a delimited
 * block, accounting for masquerading.
 *
 * Three cases:
 * 1. `sourceDelimiter` is set — use parent block
 *    delimiter chars (the block was masqueraded from a
 *    parent block).
 * 2. Leaf variant (listing/literal/pass) — standard
 *    {@link DELIMITER_CHARS}.
 * 3. Masquerade variant (verse/quote/example/sidebar)
 *    without `sourceDelimiter` — use
 *    {@link MASQUERADE_DELIMITER_CHARS}.
 * @param node - The delimited block node whose delimiter
 *   to compute.
 * @returns The correctly-sized delimiter string.
 */
function computeMasqueradeDelimiter(node: DelimitedBlockNode): string {
  if (node.sourceDelimiter !== undefined) {
    const { [node.sourceDelimiter]: parentChar } = PARENT_DELIMITER_CHARS;
    return node.sourceDelimiter === "open"
      ? parentChar.repeat(OPEN_BLOCK_DELIMITER_LENGTH)
      : computeDelimiter(node.content, parentChar);
  }
  if (node.variant in DELIMITER_CHARS) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- checked by `in` guard
    const { [node.variant as LeafBlockVariant]: leafChar } = DELIMITER_CHARS;
    return computeDelimiter(node.content, leafChar);
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- remaining variants are masqueraded
  const { [node.variant as MasqueradedVariant]: masqChar } =
    MASQUERADE_DELIMITER_CHARS;
  return computeDelimiter(node.content, masqChar);
}

/**
 * Prints a delimited leaf block to Doc IR.
 *
 * Produces delimiter, content lines (verbatim), delimiter.
 * Content is not reflowed — it is preserved exactly. The
 * delimiter length is computed by
 * {@link computeDelimiter} to avoid conflicts with
 * content. Indented literal paragraphs (form: "indented")
 * and paragraph-form blocks are printed verbatim without
 * delimiters.
 * @param node - The delimited block AST node.
 * @returns Doc IR for the formatted block.
 */
function printDelimitedBlock(node: DelimitedBlockNode): Doc {
  // Indented literal paragraphs and paragraph-form blocks: print
  // content verbatim without delimiters. The preceding attribute
  // list (for paragraph form) is a separate node handled by the
  // printer's stacking behavior.
  if (node.form === "indented" || node.form === "paragraph") {
    const contentLines = node.content.split("\n");
    return join(hardline, contentLines);
  }

  // Determine the delimiter character and compute its length.
  // When a block was masqueraded (e.g. [source] on open block
  // `--`), the sourceDelimiter tells us which parent block
  // delimiter to use instead of the variant's default.
  const delimiter = computeMasqueradeDelimiter(node);

  // When a fenced code block had a language hint, emit a
  // [source,lang] attribute list before the delimiter to
  // normalize to AsciiDoc-native syntax.
  const prefix: Doc[] =
    node.language === undefined
      ? []
      : ["[source,", node.language, "]", hardline];

  // Use trim() to detect whitespace-only content: Prettier strips
  // trailing whitespace per line, so all-whitespace content would
  // become blank lines that re-parse as an empty block, breaking
  // idempotency.
  if (node.content.trim().length > EMPTY) {
    const contentLines = node.content.split("\n");
    return [
      ...prefix,
      delimiter,
      hardline,
      join(hardline, contentLines),
      hardline,
      delimiter,
    ];
  }
  return [...prefix, delimiter, hardline, delimiter];
}

// Maps each parent block variant to its delimiter character and
// default length. Open blocks always use exactly 2 dashes.
const PARENT_DELIMITER_CHARS: Record<ParentBlockNode["variant"], string> = {
  example: "=",
  sidebar: "*",
  open: "-",
  quote: "_",
};

// Open block delimiter is always exactly 2 dashes.
const OPEN_BLOCK_DELIMITER_LENGTH = 2;

/**
 * Recursively finds the maximum delimiter length used by
 * any descendant parent block with the given variant.
 *
 * Searches through ALL children — not just same-variant
 * — because a quote block inside a sidebar inside a quote
 * still produces `____` delimiters within the outer
 * quote's formatted output. Without this, nested
 * same-type blocks would normalize to identical delimiter
 * lengths and collapse on re-parse.
 * @param variant - The parent-block variant whose
 *   delimiter length to track.
 * @param children - The child block nodes to recurse
 *   into.
 * @returns The longest same-variant delimiter found
 *   among descendants, or 0 if none exist.
 */
function maxDescendantDelimiter(
  variant: ParentBlockNode["variant"],
  children: readonly BlockNode[],
): number {
  let max = EMPTY;
  for (const child of children) {
    if (child.type === "parentBlock") {
      // Recurse into all parent block children regardless of
      // variant — same-variant blocks might be nested deeper.
      const childInner = maxDescendantDelimiter(variant, child.children);
      if (child.variant === variant) {
        // This child uses the same delimiter character. Its own
        // length is at least MIN_DELIMITER_LENGTH plus whatever
        // its own nesting requires.
        const childLength = Math.max(
          MIN_DELIMITER_LENGTH,
          childInner + SAFE_DELIMITER_PAD,
        );
        max = Math.max(max, childLength);
      } else {
        // Different variant — propagate inner max unchanged.
        max = Math.max(max, childInner);
      }
    } else if (
      // Delimited-form admonitions produce parent block delimiters
      // and must be included in the nesting computation.
      child.type === "admonition" &&
      child.form === "delimited" &&
      child.delimiter !== undefined
    ) {
      const childInner = maxDescendantDelimiter(variant, child.children);
      if (child.delimiter === variant) {
        const childLength = Math.max(
          MIN_DELIMITER_LENGTH,
          childInner + SAFE_DELIMITER_PAD,
        );
        max = Math.max(max, childLength);
      } else {
        max = Math.max(max, childInner);
      }
    }
  }
  return max;
}

/**
 * Prints a parent (structural) block to Doc IR.
 *
 * Parent blocks contain other blocks as children and are
 * fenced by delimiter lines (e.g. `====` for example
 * blocks, `--` for open blocks). The delimiter length
 * is computed to be longer than any same-variant nested
 * descendant, preserving the nesting structure on
 * re-parse.
 * @param node - The parent block AST node.
 * @param path - Prettier's AST path, used to recurse
 *   into children via `path.map(print, "children")`.
 * @param print - Prettier's recursive print callback.
 * @returns Doc IR for the formatted parent block.
 */
function printParentBlock(
  node: ParentBlockNode,
  path: PrintPath,
  print: PrintFunction,
): Doc {
  const { [node.variant]: delimChar } = PARENT_DELIMITER_CHARS;

  // Open blocks are always exactly 2 dashes — no nesting
  // concerns because there's only one possible length.
  if (node.variant === "open") {
    const delimiter = delimChar.repeat(OPEN_BLOCK_DELIMITER_LENGTH);
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

  // For parent blocks that support variable-length delimiters,
  // ensure the outer delimiter is longer than any same-type
  // nested child. Without this, nested same-type blocks would
  // all normalize to MIN_DELIMITER_LENGTH and lose their
  // nesting structure on re-parse.
  const innerMax = maxDescendantDelimiter(node.variant, node.children);
  const delimLength = Math.max(
    MIN_DELIMITER_LENGTH,
    innerMax + SAFE_DELIMITER_PAD,
  );
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

/**
 * Prints an admonition node to Doc IR.
 *
 * Paragraph-form admonitions (`NOTE: text`) produce a
 * label prefix followed by reflowed text using fill()
 * (same as paragraphs).
 *
 * Delimited-form admonitions are printed as parent block
 * delimiters wrapping the children. The `[NOTE]`
 * attribute list that precedes the block is a separate
 * metadata node handled by the stacking behavior in
 * {@link joinBlocks}.
 * @param node - The admonition AST node.
 * @param path - Prettier's AST path, used to recurse
 *   into children for delimited-form admonitions.
 * @param print - Prettier's recursive print callback.
 * @returns Doc IR for the formatted admonition.
 */
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
    // wordsToFillParts handles block-syntax-at-line-start
    // prevention (see its doc comment).
    const words = node.content
      .split(/\s+/v)
      .filter((word) => word.length > EMPTY);
    const parts = wordsToFillParts(words);
    // No align() here: leading spaces in AsciiDoc denote an
    // indented literal block, so continuation lines must start
    // at column 0 to preserve document semantics.
    return [label, fill(parts)];
  }

  // Delimited form: use the stored delimiter variant to
  // reconstruct the correct delimiters (example `====` or
  // open `--`).
  const delimVariant = node.delimiter ?? "example";
  const { [delimVariant]: delimChar } = PARENT_DELIMITER_CHARS;
  // For non-open delimiters, ensure the admonition's delimiter is
  // longer than any same-variant nested block — same logic as
  // printParentBlock. Without this, a delimited admonition
  // wrapping a same-variant parent block would produce matching
  // delimiter lengths, collapsing the nesting on re-parse.
  const delimLength =
    delimVariant === "open"
      ? OPEN_BLOCK_DELIMITER_LENGTH
      : Math.max(
          MIN_DELIMITER_LENGTH,
          maxDescendantDelimiter(delimVariant, node.children) +
            SAFE_DELIMITER_PAD,
        );
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

/**
 * Prints an attribute entry node to Doc IR.
 *
 * Produces the canonical `:name: value` form, handling
 * the three attribute-unset syntaxes: prefix bang
 * (`:!name:`), suffix bang (`:name!:`), and no bang
 * (attribute set, with or without a value).
 * @param node - The attribute entry node.
 * @param node.name - The attribute name (without
 *   surrounding colons).
 * @param node.value - The attribute value, or undefined
 *   for no-value entries (`:name:`) and unset entries.
 * @param node.unset - How the attribute is unset:
 *   "prefix" for `:!name:`, "suffix" for `:name!:`,
 *   or false when the attribute is being set (with or
 *   without a value).
 * @returns Doc IR for the formatted attribute entry.
 */
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

/**
 * Prints a list node: items separated by hard line
 * breaks.
 *
 * Items at different depths are handled by the nested
 * ListNode structure — each ListItemNode prints its own
 * nested children recursively.
 * @param path - Prettier's AST path, used to recurse
 *   into list items via `path.map(print, "children")`.
 * @param print - Prettier's recursive print callback.
 * @returns Doc IR for the formatted list.
 */
function printList(path: PrintPath, print: PrintFunction): Doc {
  // eslint-disable-next-line unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument -- AstPath#map, not Array#map
  const items = path.map(print, "children");
  return join(hardline, items);
}

/**
 * Builds the marker string for a list item based on the
 * parent list's variant.
 *
 * Callout lists use `<N>` or `<.>` markers; ordered
 * lists use dots; unordered lists use asterisks. The
 * marker depth (number of repeated characters) encodes
 * the nesting level.
 * @param node - The list item whose marker to build.
 * @param parentList - The parent list node, used to
 *   determine the variant (ordered, unordered, callout).
 * @returns The marker string (e.g. `**`, `...`, `<1>`).
 */
function buildMarker(
  node: ListItemNode,
  parentList: ListNode | undefined,
): string {
  if (parentList?.variant === "callout") {
    // Auto-numbered callouts store 0 as calloutNumber.
    const calloutLabel =
      node.calloutNumber === EMPTY ? "." : String(node.calloutNumber);
    return `<${calloutLabel}>`;
  }
  const markerChar = parentList?.variant === "ordered" ? "." : "*";
  return markerChar.repeat(node.depth);
}

/**
 * Formats a checklist checkbox into its canonical string
 * representation.
 *
 * Normalizes `[*]` to `[x]` (the canonical checked
 * form). Returns an empty string for non-checklist items
 * so the caller can unconditionally prepend the result.
 * @param checkbox - The checkbox state: "checked",
 *   "unchecked", or undefined for non-checklist items.
 * @returns The checkbox prefix string, or empty string
 *   if the item has no checkbox.
 */
function formatCheckbox(checkbox: ListItemNode["checkbox"]): string {
  if (checkbox === "checked") {
    return "[x] ";
  }
  if (checkbox === "unchecked") {
    return "[ ] ";
  }
  return "";
}

/**
 * Prints a single list item to Doc IR.
 *
 * Produces marker + space + text content, with text
 * reflowed via fill(). Continuation lines are aligned
 * to the text start (past the marker). Nested lists
 * appear on the next line after the item text, outside
 * the fill.
 * @param node - The list item AST node.
 * @param path - Prettier's AST path, used to recurse
 *   into children and access the parent list node.
 * @param print - Prettier's recursive print callback.
 * @returns Doc IR for the formatted list item.
 */
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
  const checkboxPrefix = formatCheckbox(node.checkbox);

  // Continuation lines should align with the text start, which
  // is marker width + 1 space after the marker character(s).
  const markerWidth = marker.length + MARKER_OFFSET;

  // eslint-disable-next-line unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument -- AstPath#map, not Array#map
  const printed = path.map(print, "children");

  // Separate inline children (text, bold, hardLineBreak, etc.)
  // from nested lists. Inline children are reflowed inside a
  // fill(); nested lists follow on their own lines.
  const inlineParts: Doc[] = [];
  const nestedListParts: Doc[] = [];

  for (const [index, child] of node.children.entries()) {
    const { [index]: printedChild } = printed;
    if (child.type === "list") {
      // Nested list: appears on the next line after a
      // hardline break, outside the fill.
      nestedListParts.push(hardline, printedChild);
    } else {
      // Inline node: collect into parts for fill(). The
      // printed inline node is either a Doc[] (text words
      // interleaved with `line`) or a single Doc (marks,
      // hard line breaks, etc.).
      const flat = Array.isArray(printedChild)
        ? (printedChild as Doc[])
        : [printedChild];
      inlineParts.push(...flat);
    }
  }

  // Build the output: marker + space + checkbox + aligned
  // fill of inline content, followed by any nested lists.
  const item = fill([
    marker,
    " ",
    checkboxPrefix,
    align(markerWidth, fill(inlineParts)),
  ]);

  return [item, ...nestedListParts];
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
      case "text":
      case "bold":
      case "italic":
      case "monospace":
      case "highlight":
      case "attributeReference":
      case "link":
      case "xref":
      case "inlineAnchor":
      case "inlineImage":
      case "kbd":
      case "btn":
      case "menu":
      case "footnote":
      case "passthrough":
      case "hardLineBreak": {
        return printInlineNode(node, path, print);
      }
    }
  },
};

export default printer;
