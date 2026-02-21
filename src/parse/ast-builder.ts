/**
 * CST-to-AST visitor for AsciiDoc.
 *
 * Chevrotain's parser produces a Concrete Syntax Tree (CST) — a generic tree
 * of rule invocations and tokens. This visitor walks the CST and builds our
 * typed AST designed for Prettier.
 *
 * Key design decisions:
 * - Sections are parsed flat in the grammar, then nested here using a
 *   stack-based algorithm: deeper sections become children of shallower
 *   ones. This keeps the grammar simple and the nesting logic in one place.
 * - Position offsets are exclusive-end (one past last character) to match
 *   Prettier conventions, so we add +1 to Chevrotain's inclusive endOffset.
 * - The visitor receives `sourceText` as a parameter (Chevrotain's second arg
 *   to visit()) so computeEnd() can calculate the document's end position.
 */
import type {
  DocumentNode,
  ParagraphNode,
  CommentNode,
  AttributeEntryNode,
  DelimitedBlockNode,
  ParentBlockNode,
  AdmonitionNode,
  TextNode,
  BlockNode,
  ListNode,
} from "../ast.js";
import { asciidocParser } from "./grammar.js";
import { nestListItems, type FlatListItem } from "./list-builder.js";
import {
  parseCheckbox,
  buildDelimitedBlock,
  buildParentBlock,
  extractBlockCommentContent,
  buildBaseFlatItem,
  mergeTextTokens,
  findSubrule,
} from "./block-helpers.js";
import { nestSections } from "./section-builder.js";
import { convertParagraphFormBlocks } from "./paragraph-form.js";
import { convertDiscreteHeadings } from "./discrete-heading.js";
import { EMPTY, FIRST, LAST_ELEMENT } from "../constants.js";
import { buildTokenBlock } from "./token-builders.js";
import {
  FIRST_COLUMN,
  FIRST_LINE,
  makeLocation,
  tokenStartLocation,
  tokenEndLocation,
  computeEnd,
} from "./positions.js";
import type {
  DocumentCstChildren,
  BlockCstChildren,
  ParagraphCstChildren,
  UnorderedListCstChildren,
  ListItemCstChildren,
  OrderedListCstChildren,
  OrderedListItemCstChildren,
  CalloutListCstChildren,
  CalloutListItemCstChildren,
  BlockCommentCstChildren,
  ListingBlockCstChildren,
  LiteralBlockCstChildren,
  PassBlockCstChildren,
  ExampleBlockCstChildren,
  SidebarBlockCstChildren,
  OpenBlockCstChildren,
  QuoteBlockCstChildren,
  LiteralParagraphCstChildren,
  AdmonitionParagraphCstChildren,
  AttributeEntryCstChildren,
} from "./cst-types.js";

// The UnorderedListMarker token image includes a trailing space
// (e.g. "* ", "** "). Subtracting this gives the nesting depth.
const TRAILING_SPACE_LEN = 1;

// Callout lists are always flat — they don't support nesting like
// unordered or ordered lists. Every callout item is at depth 1.
const CALLOUT_DEPTH = 1;

// Regex extracting the number between angle brackets in a
// callout marker token: `<1> ` → "1", `<.> ` → ".".
const CALLOUT_NUMBER_RE = /<(?<inner>[^>]+)>/v;

// Attribute entry: `:name: value`, `:name:`, `:!name:`, or
// `:name!:`. Groups: optional prefix `!`, the attribute name,
// optional suffix `!`, and optionally a space + value text.
const ATTRIBUTE_ENTRY_RE =
  /^:(?<prefixBang>!?)(?<name>[A-Za-z_][\w\-]*)(?<suffixBang>!?):\s?(?<value>.+)?$/v;

// getBaseCstVisitorConstructorWithDefaults generates a base class with no-op
// methods for every grammar rule, so we only override the rules we need.

const BaseCstVisitor = asciidocParser.getBaseCstVisitorConstructorWithDefaults<
  string,
  unknown
>();

/**
 * Stateless: a single instance is reused across parse calls.
 * validateVisitor() catches mismatches between grammar rules
 * and visitor methods at construction time rather than at
 * first parse, so typos surface immediately.
 */
// Chevrotain dispatches visitor methods via `this` — they don't
// reference instance state directly, which triggers this rule.
/* eslint-disable @typescript-eslint/class-methods-use-this -- Chevrotain visitor dispatch */
export class AstBuilder extends BaseCstVisitor {
  constructor() {
    super();
    this.validateVisitor();
  }

  /**
   * The grammar parses sections flat (a section heading is
   * just another block). We nest them here using a stack-based
   * algorithm rather than in the grammar because Chevrotain's
   * recursive rules would make section nesting much more
   * complex — and we'd need lookahead to know when a section
   * ends. The linear scan with a stack is simpler and matches
   * how AsciiDoc sections actually nest.
   */
  document(context: DocumentCstChildren, sourceText: string): DocumentNode {
    const flatBlocks: BlockNode[] = [];

    if (context.block !== undefined) {
      for (const blockCst of context.block) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Chevrotain visitor returns unknown
        flatBlocks.push(this.visit(blockCst, sourceText) as BlockNode);
      }
    }

    // Convert paragraph-form blocks (e.g. [source] + paragraph →
    // DelimitedBlockNode with form: "paragraph") before section
    // nesting so they work correctly inside sections.
    const withParagraphForms = convertParagraphFormBlocks(flatBlocks);

    // Convert [discrete] + section pairs to DiscreteHeadingNode
    // before nesting, so they aren't used as nesting targets.
    const withDiscreteHeadings =
      convertDiscreteHeadings(withParagraphForms);
    const children = nestSections(withDiscreteHeadings);

    return {
      type: "document",
      children,
      position: {
        start: makeLocation(FIRST, FIRST_LINE, FIRST_COLUMN),
        end: computeEnd(sourceText),
      },
    };
  }

  /**
   * Sections and line comments are single-token rules that
   * can be built directly from the token. Other block types
   * are subrules delegated to their visitor methods.
   */
  block(context: BlockCstChildren, sourceText: string): BlockNode {
    // Try single-token block types first.
    const tokenBlock = buildTokenBlock(context);
    if (tokenBlock !== undefined) {
      return tokenBlock;
    }

    // Subrules (block comments, attribute entries, lists,
    // paragraphs) are delegated to their visitor methods.
    const subrule = findSubrule(context);
    if (subrule === undefined) {
      throw new Error(
        "Block must contain a section, comment, attribute entry, list, or paragraph",
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Chevrotain visitor returns unknown
    return this.visit(subrule, sourceText) as BlockNode;
  }

  /**
   * Joins TextContent tokens into a single text node. The
   * lexer splits each line into a separate token; we rejoin
   * with \n so the printer can reflow independently.
   */
  paragraph(context: ParagraphCstChildren): ParagraphNode {
    const textTokens = context.TextContent ?? [];
    // The lexer splits each line into a separate TextContent token
    // (Newlines between them are consumed by the grammar but not
    // passed here). We rejoin with \n so the printer can later
    // split and trim each line independently.
    const value = textTokens.map((t) => t.image).join("\n");

    const [firstToken] = textTokens;
    const lastToken = textTokens.at(LAST_ELEMENT) ?? firstToken;

    const start = tokenStartLocation(firstToken);
    const end = tokenEndLocation(lastToken);

    const textNode: TextNode = {
      type: "text",
      value,
      position: { start, end },
    };

    return {
      type: "paragraph",
      children: [textNode],
      position: { start, end },
    };
  }

  // Collects flat list items and nests them by marker depth.
  unorderedList(context: UnorderedListCstChildren): ListNode {
    const itemCsts = context.listItem ?? [];
    // Collect flat items with their depth and AST data.
    const flatItems = itemCsts.map(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Chevrotain visitor returns unknown
      (cst) => this.visit(cst) as FlatListItem,
    );

    return nestListItems(flatItems);
  }

  /** Extracts a flat list item (depth, text, checkbox, position). */
  listItem(context: ListItemCstChildren): FlatListItem {
    const markerToken = context.UnorderedListMarker?.[FIRST];
    if (markerToken === undefined) {
      throw new Error(
        "List item must contain an UnorderedListMarker token",
      );
    }

    // The marker image is `*{1,5} ` or `- `. For `*`-style markers,
    // depth = number of asterisks. For `-`, depth is always 1. Both
    // cases reduce to image length minus the trailing space.
    const depth = markerToken.image.length - TRAILING_SPACE_LEN;

    // Merge TextContent and IndentedLine tokens in source order.
    // IndentedLine images have leading whitespace that must be
    // stripped so the AST value contains clean text.
    const allTokens = mergeTextTokens(
      context.TextContent ?? [],
      context.IndentedLine ?? [],
    );
    const rawValue = allTokens
      .map((t) => t.image.trimStart())
      .join("\n");

    // Detect checklist markers: [x], [*], or [ ] followed by a
    // space at the start of the item text.
    const { checkbox, value, prefixLength } =
      parseCheckbox(rawValue);

    const lastToken = allTokens.at(LAST_ELEMENT) ?? markerToken;

    // When a checkbox prefix is present, shift textStart forward
    // by the prefix length so the position tracks the actual
    // content text, not the checkbox marker.
    const baseTextStart = allTokens.length > EMPTY
      ? tokenStartLocation(allTokens[FIRST])
      : tokenStartLocation(markerToken);
    const textStart = prefixLength > EMPTY
      ? makeLocation(
          baseTextStart.offset + prefixLength,
          baseTextStart.line,
          baseTextStart.column + prefixLength,
        )
      : baseTextStart;

    return {
      depth,
      value,
      checkbox,
      calloutNumber: undefined,
      start: tokenStartLocation(markerToken),
      end: tokenEndLocation(lastToken),
      textStart,
      textEnd: tokenEndLocation(lastToken),
    };
  }

  // Nests flat ordered list items by marker depth.
  orderedList(context: OrderedListCstChildren): ListNode {
    const itemCsts = context.orderedListItem ?? [];
    const flatItems = itemCsts.map(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Chevrotain visitor returns unknown
      (cst) => this.visit(cst) as FlatListItem,
    );

    return nestListItems(flatItems, "ordered");
  }

  /** Extracts flat ordered list item (depth, text, position). */
  orderedListItem(
    context: OrderedListItemCstChildren,
  ): FlatListItem {
    const markerToken = context.OrderedListMarker?.[FIRST];
    if (markerToken === undefined) {
      throw new Error(
        "Ordered list item must contain an OrderedListMarker token",
      );
    }

    // The marker image is `.{1,5} ` — depth is the number of
    // dots (image length minus the trailing space).
    const depth = markerToken.image.length - TRAILING_SPACE_LEN;
    return buildBaseFlatItem(
      markerToken, context.TextContent ?? [], depth,
      { indentedTokens: context.IndentedLine ?? [] },
    );
  }

  // Builds a flat callout list (callouts don't nest).
  calloutList(context: CalloutListCstChildren): ListNode {
    const itemCsts = context.calloutListItem ?? [];
    const flatItems = itemCsts.map(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Chevrotain visitor returns unknown
      (cst) => this.visit(cst) as FlatListItem,
    );

    return nestListItems(flatItems, "callout");
  }

  /** Extracts flat callout item (callout number, text, position). */
  calloutListItem(
    context: CalloutListItemCstChildren,
  ): FlatListItem {
    const markerToken = context.CalloutListMarker?.[FIRST];
    if (markerToken === undefined) {
      throw new Error(
        "Callout list item must contain a CalloutListMarker token",
      );
    }

    // Extract callout number: "<1> " → 1, "<.> " → 0 (auto).
    const innerMatch =
      CALLOUT_NUMBER_RE.exec(markerToken.image);
    const inner = innerMatch?.groups?.inner ?? ".";
    const calloutNumber =
      inner === "." ? EMPTY : Number.parseInt(inner, 10);

    return buildBaseFlatItem(
      markerToken,
      context.TextContent ?? [],
      CALLOUT_DEPTH,
      {
        calloutNumber,
        indentedTokens: context.IndentedLine ?? [],
      },
    );
  }

  /** Extracts verbatim content between block comment delimiters. */
  blockComment(
    context: BlockCommentCstChildren,
    sourceText: string,
  ): CommentNode {
    const delimiterToken = context.BlockCommentDelimiter?.[FIRST];
    const endToken = context.BlockCommentEnd?.[FIRST];
    if (delimiterToken === undefined || endToken === undefined) {
      throw new Error(
        "Block comment must have opening and closing delimiters",
      );
    }

    // Extract verbatim content directly from the source text.
    // Token-based reconstruction would lose blank lines inside the
    // comment because the CST groups tokens by type, not position.
    const value = extractBlockCommentContent(
      delimiterToken, endToken, sourceText,
    );

    return {
      type: "comment",
      commentType: "block",
      value,
      position: {
        start: tokenStartLocation(delimiterToken),
        end: tokenEndLocation(endToken),
      },
    };
  }

  /** Builds a listing block from its delimiters and source text. */
  listingBlock(
    context: ListingBlockCstChildren,
    sourceText: string,
  ): DelimitedBlockNode {
    return buildDelimitedBlock(
      context.ListingBlockOpen,
      context.ListingBlockClose,
      "listing",
      sourceText,
    );
  }

  /** Builds a literal block from its delimiters and source text. */
  literalBlock(
    context: LiteralBlockCstChildren,
    sourceText: string,
  ): DelimitedBlockNode {
    return buildDelimitedBlock(
      context.LiteralBlockOpen,
      context.LiteralBlockClose,
      "literal",
      sourceText,
    );
  }

  passBlock(
    context: PassBlockCstChildren,
    sourceText: string,
  ): DelimitedBlockNode {
    return buildDelimitedBlock(
      context.PassBlockOpen,
      context.PassBlockClose,
      "pass",
      sourceText,
    );
  }

  /**
   * Builds an example block from delimiter tokens and
   * recursively visited child blocks.
   */
  exampleBlock(
    context: ExampleBlockCstChildren,
    sourceText: string,
  ): ParentBlockNode {
    const children = (context.block ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Chevrotain visitor returns unknown
      (cst) => this.visit(cst, sourceText) as BlockNode,
    );
    return buildParentBlock(
      context.ExampleBlockDelimiter,
      "example",
      children,
    );
  }

  /**
   * Builds a sidebar block from delimiter tokens and
   * recursively visited child blocks.
   */
  sidebarBlock(
    context: SidebarBlockCstChildren,
    sourceText: string,
  ): ParentBlockNode {
    const children = (context.block ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Chevrotain visitor returns unknown
      (cst) => this.visit(cst, sourceText) as BlockNode,
    );
    return buildParentBlock(
      context.SidebarBlockDelimiter,
      "sidebar",
      children,
    );
  }

  /**
   * Builds an open block from delimiter tokens and
   * recursively visited child blocks.
   */
  openBlock(
    context: OpenBlockCstChildren,
    sourceText: string,
  ): ParentBlockNode {
    const children = (context.block ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Chevrotain visitor returns unknown
      (cst) => this.visit(cst, sourceText) as BlockNode,
    );
    return buildParentBlock(
      context.OpenBlockDelimiter,
      "open",
      children,
    );
  }

  /**
   * Builds a quote block from delimiter tokens and
   * recursively visited child blocks.
   */
  quoteBlock(
    context: QuoteBlockCstChildren,
    sourceText: string,
  ): ParentBlockNode {
    const children = (context.block ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Chevrotain visitor returns unknown
      (cst) => this.visit(cst, sourceText) as BlockNode,
    );
    return buildParentBlock(
      context.QuoteBlockDelimiter,
      "quote",
      children,
    );
  }

  /**
   * Builds a literal paragraph from consecutive indented lines.
   * Each IndentedLine token preserves its leading spaces; we
   * join them with newlines to form the verbatim content.
   */
  literalParagraph(
    context: LiteralParagraphCstChildren,
  ): DelimitedBlockNode {
    const lineTokens = context.IndentedLine ?? [];
    const content = lineTokens
      .map((t) => t.image)
      .join("\n");

    const [firstToken] = lineTokens;
    const lastToken = lineTokens.at(LAST_ELEMENT) ?? firstToken;

    return {
      type: "delimitedBlock",
      variant: "literal",
      form: "indented",
      content,
      position: {
        start: tokenStartLocation(firstToken),
        end: tokenEndLocation(lastToken),
      },
    };
  }

  /**
   * Admonition paragraph: `NOTE: text`, `TIP: text`, etc.
   * The marker token image is `"NOTE: "` — we strip the
   * trailing colon-space to get the variant name. Text content
   * tokens (if any) are joined with newlines for reflow.
   */
  admonitionParagraph(
    context: AdmonitionParagraphCstChildren,
  ): AdmonitionNode {
    const markerToken = context.AdmonitionMarker?.[FIRST];
    if (markerToken === undefined) {
      throw new Error("AdmonitionParagraph must have a marker");
    }

    // "NOTE: " → "note", "WARNING: " → "warning"
    const COLON_SPACE_LEN = 2;
    const variant = markerToken.image
      .slice(EMPTY, -COLON_SPACE_LEN)
      .toLowerCase();

    const textTokens = context.TextContent ?? [];
    const content =
      textTokens.length > EMPTY
        ? textTokens.map((t) => t.image).join("\n")
        : undefined;

    const lastTextToken = textTokens.at(LAST_ELEMENT);
    const endToken = lastTextToken ?? markerToken;

    return {
      type: "admonition",
      variant,
      form: "paragraph",
      delimiter: undefined,
      content,
      children: [],
      position: {
        start: tokenStartLocation(markerToken),
        end: tokenEndLocation(endToken),
      },
    };
  }

  /** Parses attribute entry: name, optional value, unset form. */
  attributeEntry(
    context: AttributeEntryCstChildren,
  ): AttributeEntryNode {
    const token = context.AttributeEntry?.[FIRST];
    if (token === undefined) {
      throw new Error("Attribute entry must contain an AttributeEntry token");
    }

    const match = ATTRIBUTE_ENTRY_RE.exec(token.image);
    if (match?.groups === undefined) {
      throw new Error(`Invalid attribute entry: ${token.image}`);
    }

    const { groups } = match;
    const { prefixBang, name, suffixBang } = groups;
    // Track which unset form was used so the printer can reproduce
    // the original syntax. `false` means "not unset".
    let unset: false | "prefix" | "suffix" = false;
    if (prefixBang === "!") {
      unset = "prefix";
    } else if (suffixBang === "!") {
      unset = "suffix";
    }
    // Extract and trim the optional value. TypeScript types regex
    // groups as `string`, but unmatched optional groups are actually
    // `undefined` at runtime, so we widen the type with `as`.
    const rawValue = groups.value as string | undefined;
    const trimmed = rawValue?.trim();

    return {
      type: "attributeEntry",
      name,
      value: trimmed === undefined || trimmed.length === EMPTY
        ? undefined
        : trimmed,
      unset,
      position: {
        start: tokenStartLocation(token),
        end: tokenEndLocation(token),
      },
    };
  }
}
/* eslint-enable @typescript-eslint/class-methods-use-this */
