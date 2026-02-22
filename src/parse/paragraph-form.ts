/**
 * Post-parse transformation: paragraph-form blocks.
 *
 * When a `BlockAttributeListNode` with a recognized block style
 * (source, listing, literal, pass, verse, quote, example, sidebar)
 * immediately precedes a `ParagraphNode`, the paragraph is converted
 * to a `DelimitedBlockNode` with `form: "paragraph"`. The attribute
 * list node is kept as a separate sibling — the printer's stacking
 * behavior handles placing it on the line before the block content.
 *
 * This transformation runs on the flat block array after CST visiting
 * but before section nesting, so paragraph-form blocks inside
 * sections are handled correctly.
 */
import type {
  AdmonitionNode,
  BlockNode,
  BlockAttributeListNode,
  DelimitedBlockNode,
  ParagraphNode,
} from "../ast.js";
import { FIRST, NEXT, PAIR_LENGTH } from "../constants.js";

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

// Extracts the first positional attribute (the style) from
// a block attribute list value. The value is the text between
// brackets, e.g. "source,ruby" → "source", "verse" → "verse".
function extractStyle(value: string): string {
  // Split on the first comma to isolate the style name from
  // any additional positional attributes (e.g. language).
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

// Converts the text content of a paragraph node into a
// verbatim string for the delimited block's content field.
function paragraphToContent(paragraph: ParagraphNode): string {
  // ParagraphNode.children is [TextNode] — the text node's
  // value already has lines joined by \n from the AST builder.
  return paragraph.children.map((child) => child.value).join("\n");
}

/**
 * Scans the flat block array for `BlockAttributeListNode` +
 * `ParagraphNode` pairs where the attribute list declares a
 * paragraph-form style. Converts the paragraph to a
 * `DelimitedBlockNode` with `form: "paragraph"` in place.
 *
 * Returns a new array (does not mutate the input).
 */
export function convertParagraphFormBlocks(blocks: BlockNode[]): BlockNode[] {
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
