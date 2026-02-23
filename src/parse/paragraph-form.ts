/**
 * Post-parse transformations: paragraph-form blocks and
 * block masquerading (style-driven content model).
 *
 * **Paragraph-form blocks:** When a `BlockAttributeListNode` with a
 * recognized block style (source, listing, literal, pass, verse,
 * quote, example, sidebar) immediately precedes a `ParagraphNode`,
 * the paragraph is converted to a `DelimitedBlockNode` with
 * `form: "paragraph"`.
 *
 * **Block masquerading:** When a style attribute on a delimited
 * block changes its effective content model, the block is
 * transformed accordingly. For example, `[verse]` before a
 * `____` block converts it from compound (parsed children) to
 * verbatim (raw string content), because verse line breaks are
 * semantically significant and must not be reflowed.
 *
 * Both transformations keep the attribute list node as a separate
 * sibling — the printer's stacking behavior handles placing it on
 * the line before the block content.
 *
 * This runs on the flat block array after CST visiting but before
 * section nesting, so blocks inside sections are handled correctly.
 */
import type {
  AdmonitionNode,
  BlockNode,
  BlockAttributeListNode,
  DelimitedBlockNode,
  InlineNode,
  ParentBlockNode,
  ParagraphNode,
} from "../ast.js";
import { FIRST, NEWLINE_LENGTH, NEXT, PAIR_LENGTH } from "../constants.js";

// Maps recognized first positional attribute values to the
// `DelimitedBlockNode.variant` they produce. AsciiDoc `source`
// and `listing` both map to the "listing" variant.
const PARAGRAPH_FORM_STYLES: ReadonlyMap<
  string,
  DelimitedBlockNode["variant"]
> = new Map([
  ["source", "listing"],
  ["listing", "listing"],
  ["literal", "literal"],
  ["pass", "pass"],
  ["verse", "verse"],
  ["quote", "quote"],
  ["example", "example"],
  ["sidebar", "sidebar"],
]);

// Maps style attributes that masquerade a parent block's
// content model to verbatim. The key is the style name
// (first positional attribute), the value is the target
// `DelimitedBlockNode.variant`. Only styles that CHANGE the
// content model from compound (parsed children) to verbatim
// (raw string) are included. Styles that keep the block
// compound (e.g. `[quote]` on `--`) need no transformation.
//
// Outer map: parent block variant → inner map of masquerade
// style → delimited block variant.
//
// Pass-block masquerades ([stem]/[latexmath]/[asciimath] on
// `++++`) are deliberately absent: they don't change the
// content model (raw → raw, still verbatim).
const VERBATIM_MASQUERADES: ReadonlyMap<
  ParentBlockNode["variant"],
  ReadonlyMap<string, DelimitedBlockNode["variant"]>
> = new Map([
  [
    "quote",
    new Map<string, DelimitedBlockNode["variant"]>([
      ["verse", "verse"],
      ["stem", "pass"],
      ["latexmath", "pass"],
      ["asciimath", "pass"],
    ]),
  ],
  [
    "open",
    new Map<string, DelimitedBlockNode["variant"]>([
      ["source", "listing"],
      ["listing", "listing"],
      ["literal", "literal"],
      ["pass", "pass"],
      ["comment", "pass"],
      ["verse", "verse"],
    ]),
  ],
]);

// Extracts the first positional attribute (the style) from
// a block attribute list value. The value is the text between
// brackets, e.g. "source,ruby" → "source", "verse" → "verse".
function extractStyle(value: string): string {
  // Split on the first comma to isolate the style name from
  // any additional positional attributes (e.g. language).
  // Shorthand attributes like "#myid" and ".role" pass through
  // unchanged — they don't match any style lookup table, so
  // they're implicitly excluded from masquerade/form matching.
  const [first] = value.split(",");
  return first.trim();
}

// Checks whether a block attribute list node declares a
// recognized paragraph-form style.
function getParagraphFormVariant(
  node: BlockAttributeListNode,
): DelimitedBlockNode["variant"] | undefined {
  const style = extractStyle(node.value);
  return PARAGRAPH_FORM_STYLES.get(style);
}

// Checks whether a block attribute list declares an admonition
// type (NOTE, TIP, IMPORTANT, CAUTION, WARNING). Returns the
// lowercase variant name, or undefined if not an admonition.
function getAdmonitionVariant(
  node: BlockAttributeListNode,
): string | undefined {
  const style = extractStyle(node.value).toUpperCase();
  // Accept any single uppercase word as an admonition variant.
  // This covers the five built-in types (NOTE, TIP, etc.) as
  // well as custom styles like EXERCISE. Attribute lists with
  // commas, dots, hashes, or other special characters (e.g.
  // [source,ruby], [#myid], [.role]) won't match.
  const UPPERCASE_WORD = /^[A-Z]+$/v;
  if (UPPERCASE_WORD.test(style)) {
    return style.toLowerCase();
  }
  return undefined;
}

// Checks whether a block attribute list declares a verbatim
// masquerade style for the given parent block variant. Returns
// the target `DelimitedBlockNode.variant`, or undefined if
// this combination doesn't trigger a masquerade.
function getVerbatimMasquerade(
  attribute: BlockAttributeListNode,
  parentVariant: ParentBlockNode["variant"],
): DelimitedBlockNode["variant"] | undefined {
  const styleMap = VERBATIM_MASQUERADES.get(parentVariant);
  if (styleMap === undefined) {
    return undefined;
  }
  const style = extractStyle(attribute.value);
  return styleMap.get(style);
}

// Extracts the raw verbatim content from a parent block by
// slicing the source text between the open and close
// delimiters. The parent block's position spans from the
// start of the open delimiter to one past the end of the
// close delimiter (standard Prettier end-exclusive convention).
// Invariant: `node.position.start` is the first character of
// the open delimiter line; `node.position.end` is one past the
// last character of the close delimiter line. We rely on these
// offsets to slice the raw source text between delimiters.
function extractParentBlockContent(
  node: ParentBlockNode,
  sourceText: string,
): string {
  // Find the end of the open delimiter line (first newline
  // after the block's start offset).
  const openEnd = sourceText.indexOf("\n", node.position.start.offset);
  if (openEnd < FIRST) {
    return "";
  }
  const contentStart = openEnd + NEWLINE_LENGTH;

  // Find the newline before the close delimiter line. The
  // end offset is one past the close delimiter's last char,
  // so search backward from that point (within the close
  // delimiter) to find the newline that precedes it.
  const closeNewline = sourceText.lastIndexOf(
    "\n",
    node.position.end.offset - NEWLINE_LENGTH,
  );
  if (closeNewline < contentStart) {
    // No content between delimiters (empty block).
    return "";
  }

  // The content is everything from contentStart up to (but
  // not including) the newline before the close delimiter.
  return sourceText.slice(contentStart, closeNewline);
}

// Converts the text content of a paragraph node into a
// verbatim string for the delimited block's content field.
// Walks all inline children, extracting raw text from text
// nodes and preserving formatting marks from span nodes.
function paragraphToContent(paragraph: ParagraphNode): string {
  return paragraph.children.map((child) => inlineToText(child)).join("");
}

// Extracts the raw source text from an inline node,
// including any formatting marks for span nodes.
function inlineToText(node: InlineNode): string {
  switch (node.type) {
    case "text": {
      return node.value;
    }
    case "attributeReference": {
      return `{${node.name}}`;
    }
    case "bold": {
      const mark = node.constrained ? "*" : "**";
      const inner = node.children.map((child) => inlineToText(child)).join("");
      return `${mark}${inner}${mark}`;
    }
    case "italic": {
      const mark = node.constrained ? "_" : "__";
      const inner = node.children.map((child) => inlineToText(child)).join("");
      return `${mark}${inner}${mark}`;
    }
    case "monospace": {
      const mark = node.constrained ? "`" : "``";
      const inner = node.children.map((child) => inlineToText(child)).join("");
      return `${mark}${inner}${mark}`;
    }
    case "highlight": {
      const mark = node.constrained ? "#" : "##";
      const rolePrefix = node.role === undefined ? "" : `[${node.role}]`;
      const inner = node.children.map((child) => inlineToText(child)).join("");
      return `${rolePrefix}${mark}${inner}${mark}`;
    }
  }
}

/**
 * Scans the flat block array for style-driven transformations:
 *
 * 1. **Paragraph-form blocks:** `BlockAttributeListNode` +
 *    `ParagraphNode` pairs where the attribute list declares a
 *    paragraph-form style → convert to `DelimitedBlockNode`.
 *
 * 2. **Block masquerading:** `BlockAttributeListNode` +
 *    `ParentBlockNode` where the style changes the content
 *    model from compound to verbatim → convert to
 *    `DelimitedBlockNode` with raw content.
 *
 * 3. **Admonitions:** `BlockAttributeListNode` +
 *    `ParentBlockNode` where the style is an admonition type
 *    → convert to `AdmonitionNode`.
 *
 * Masquerade checks run BEFORE admonition checks because
 * styles like `verse` and `source` are not admonitions, even
 * though they match the uppercase-word pattern.
 *
 * Returns a new array (does not mutate the input).
 */
export function convertParagraphFormBlocks(
  blocks: BlockNode[],
  sourceText: string,
): BlockNode[] {
  const result: BlockNode[] = [];
  let index = FIRST;

  while (index < blocks.length) {
    const { [index]: current } = blocks;

    // When a block attribute list with a recognized style
    // (source, listing, etc.) is followed by a paragraph,
    // convert the paragraph to a paragraph-form block.
    if (current.type === "blockAttributeList" && index + NEXT < blocks.length) {
      const { [index + NEXT]: next } = blocks;
      if (next.type === "paragraph") {
        const variant = getParagraphFormVariant(current);
        if (variant !== undefined) {
          // Keep the attribute list node as metadata.
          result.push(current);

          // Convert the paragraph to a paragraph-form block.
          const content = paragraphToContent(next);
          const delimitedBlock: DelimitedBlockNode = {
            type: "delimitedBlock",
            variant,
            form: "paragraph",
            content,
            position: next.position,
          };
          result.push(delimitedBlock);

          // Skip past both the attribute list and paragraph.
          index += PAIR_LENGTH;
          continue;
        }
      }

      // Block masquerading: a style attribute on a parent
      // block changes its content model from compound
      // (parsed children) to verbatim (raw string). Check
      // masquerades BEFORE admonitions because styles like
      // `verse` and `source` are valid masquerade styles,
      // not admonitions.
      if (next.type === "parentBlock") {
        const masqueradeVariant = getVerbatimMasquerade(current, next.variant);
        if (masqueradeVariant !== undefined) {
          result.push(current);

          const content = extractParentBlockContent(next, sourceText);
          const masqueradedBlock: DelimitedBlockNode = {
            type: "delimitedBlock",
            variant: masqueradeVariant,
            form: "delimited",
            content,
            sourceDelimiter: next.variant,
            position: next.position,
          };
          result.push(masqueradedBlock);

          index += PAIR_LENGTH;
          continue;
        }
      }

      // Block-form admonitions: an attribute list with an
      // admonition type (NOTE, TIP, etc.) followed by a parent
      // block (example `====` or open `--`) becomes an
      // AdmonitionNode with form "delimited".
      if (next.type === "parentBlock") {
        const admonitionVariant = getAdmonitionVariant(current);
        if (admonitionVariant !== undefined) {
          // Keep the attribute list node as metadata for
          // the printer to output `[NOTE]` etc.
          result.push(current);

          const admonition: AdmonitionNode = {
            type: "admonition",
            variant: admonitionVariant,
            form: "delimited",
            delimiter: next.variant,
            content: undefined,
            children: next.children,
            position: next.position,
          };
          result.push(admonition);

          // Skip past both the attribute list and parent block.
          index += PAIR_LENGTH;
          continue;
        }
      }
    }

    result.push(current);
    index += NEXT;
  }

  return result;
}
