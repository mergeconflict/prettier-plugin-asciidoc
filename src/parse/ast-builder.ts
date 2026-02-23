/* eslint-disable @typescript-eslint/class-methods-use-this -- Chevrotain visitor dispatch */

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
  BlockNode,
  ListNode,
} from "../ast.js";
import { asciidocParser } from "./grammar.js";
import { nestListItems, type FlatListItem } from "./list-builder.js";
import {
  parseCheckbox,
  buildDelimitedBlock,
  buildParentBlock,
  buildBaseFlatItem,
  mergeTextTokens,
  findSubrule,
  buildRecoveredListItem,
  buildBlockComment,
  buildAdmonitionParagraph,
  buildRecoveredAttributeEntry,
  parseUnsetForm,
} from "./block-helpers.js";
import { nestSections } from "./section-builder.js";
import { convertParagraphFormBlocks } from "./paragraph-form.js";
import { convertDiscreteHeadings } from "./discrete-heading.js";
import {
  buildInlineNodesFromLines,
  flattenInlineTokens,
  inlineLinesToTextTokens,
  unwrapInlineLines,
} from "./inline-builder.js";
import {
  EMPTY,
  FIRST,
  FIRST_COLUMN,
  FIRST_LINE,
  LAST_ELEMENT,
  NEXT,
} from "../constants.js";
import { unreachable } from "../unreachable.js";
import { buildTokenBlock } from "./token-builders.js";
import {
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
  FencedCodeBlockCstChildren,
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
    const withParagraphForms = convertParagraphFormBlocks(
      flatBlocks,
      sourceText,
    );

    // Convert [discrete] + section pairs to DiscreteHeadingNode
    // before nesting, so they aren't used as nesting targets.
    const withDiscreteHeadings = convertDiscreteHeadings(withParagraphForms);
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
      // Recovery produced an empty block CST node. Return
      // a zero-width paragraph so the document structure is
      // preserved without crashing.
      return {
        type: "paragraph",
        children: [],
        position: {
          start: makeLocation(FIRST, FIRST_LINE, FIRST_COLUMN),
          end: computeEnd(sourceText),
        },
      };
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Chevrotain visitor returns unknown
    return this.visit(subrule, sourceText) as BlockNode;
  }

  // Builds inline nodes from CST inline tokens and computes
  // position from first meaningful token to last.
  paragraph(context: ParagraphCstChildren): ParagraphNode {
    const inlineLines = context.inlineLine ?? [];
    const inlineNewlines = context.InlineNewline ?? [];
    const children = buildInlineNodesFromLines(inlineLines, inlineNewlines);

    // Position excludes trailing newlines — they are
    // structural separators, not paragraph content. Use
    // only inline content tokens (not InlineNewline) for
    // position tracking.
    const contentTokens = flattenInlineTokens(
      unwrapInlineLines(inlineLines),
      [],
    );

    const start =
      contentTokens.length > EMPTY
        ? tokenStartLocation(contentTokens[FIRST])
        : makeLocation(FIRST, FIRST_LINE, FIRST_COLUMN);

    const lastToken = contentTokens.at(LAST_ELEMENT);
    const end = lastToken === undefined ? start : tokenEndLocation(lastToken);

    return {
      type: "paragraph",
      children,
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
    const textTokens = inlineLinesToTextTokens(
      context.inlineLine ?? [],
      context.InlineNewline ?? [],
    );

    if (markerToken === undefined) {
      // Recovery entered the rule without a marker token.
      // Build a stub item from whatever text is available.
      return buildRecoveredListItem(textTokens);
    }

    // The marker image is `*{1,5} ` or `- `. For `*`-style markers,
    // depth = number of asterisks. For `-`, depth is always 1. Both
    // cases reduce to image length minus the trailing space.
    const depth = markerToken.image.length - TRAILING_SPACE_LEN;

    // Merge inline text and IndentedLine tokens in source order.
    // IndentedLine images have leading whitespace that must be
    // stripped so the AST value contains clean text.
    const allTokens = mergeTextTokens(textTokens, context.IndentedLine ?? []);
    const rawValue = allTokens.map((t) => t.image.trimStart()).join("\n");

    // Detect checklist markers: [x], [*], or [ ] followed by a
    // space at the start of the item text.
    const { checkbox, value, prefixLength } = parseCheckbox(rawValue);

    const lastToken = allTokens.at(LAST_ELEMENT) ?? markerToken;

    // When a checkbox prefix is present, shift textStart forward
    // by the prefix length so the position tracks the actual
    // content text, not the checkbox marker.
    const baseTextStart =
      allTokens.length > EMPTY
        ? tokenStartLocation(allTokens[FIRST])
        : tokenStartLocation(markerToken);
    const textStart =
      prefixLength > EMPTY
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
  orderedListItem(context: OrderedListItemCstChildren): FlatListItem {
    const markerToken = context.OrderedListMarker?.[FIRST];
    if (markerToken === undefined) {
      // Recovery entered the rule without a marker token.
      return buildRecoveredListItem(
        inlineLinesToTextTokens(
          context.inlineLine ?? [],
          context.InlineNewline ?? [],
        ),
      );
    }

    // The marker image is `.{1,5} ` — depth is the number of
    // dots (image length minus the trailing space).
    const depth = markerToken.image.length - TRAILING_SPACE_LEN;
    return buildBaseFlatItem(
      markerToken,
      inlineLinesToTextTokens(
        context.inlineLine ?? [],
        context.InlineNewline ?? [],
      ),
      depth,
      {
        indentedTokens: context.IndentedLine ?? [],
      },
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
  calloutListItem(context: CalloutListItemCstChildren): FlatListItem {
    const markerToken = context.CalloutListMarker?.[FIRST];
    const textTokens = inlineLinesToTextTokens(
      context.inlineLine ?? [],
      context.InlineNewline ?? [],
    );

    if (markerToken === undefined) {
      // Recovery entered the rule without a marker token.
      return buildRecoveredListItem(textTokens);
    }

    // Extract callout number: "<1> " → 1, "<.> " → 0 (auto).
    const innerMatch = CALLOUT_NUMBER_RE.exec(markerToken.image);
    const inner = innerMatch?.groups?.inner ?? ".";
    const calloutNumber = inner === "." ? EMPTY : Number.parseInt(inner, 10);

    return buildBaseFlatItem(markerToken, textTokens, CALLOUT_DEPTH, {
      calloutNumber,
      indentedTokens: context.IndentedLine ?? [],
    });
  }

  /** Extracts verbatim content between block comment delimiters. */
  blockComment(
    context: BlockCommentCstChildren,
    sourceText: string,
  ): CommentNode {
    const delimiterToken =
      context.BlockCommentDelimiter?.[FIRST] ??
      unreachable("Block comment must have an opening delimiter");
    return buildBlockComment(
      delimiterToken,
      context.BlockCommentEnd?.[FIRST],
      sourceText,
    );
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

  /**
   * Builds a listing block from a Markdown-style fenced code
   * block. Extracts the optional language hint from the open
   * fence token image (e.g. "rust" from `` ```rust ``).
   */
  fencedCodeBlock(
    context: FencedCodeBlockCstChildren,
    sourceText: string,
  ): DelimitedBlockNode {
    const node = buildDelimitedBlock(
      context.FencedCodeOpen,
      context.FencedCodeClose,
      "listing",
      sourceText,
    );

    // Extract language from the open fence: "```rust" → "rust".
    // The token image is the full matched text including the
    // backticks. Everything after the 3 backticks is the hint.
    const BACKTICK_COUNT = 3;
    const openImage = context.FencedCodeOpen?.[FIRST]?.image ?? "";
    const lang = openImage.slice(BACKTICK_COUNT).trim();
    if (lang.length > EMPTY) {
      node.language = lang;
    }

    return node;
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
      context.ExampleBlockOpen,
      context.ExampleBlockClose,
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
      context.SidebarBlockOpen,
      context.SidebarBlockClose,
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
    // Open blocks use a single token type for both open and
    // close. The CST array has open at [0] and close at [1].
    // Split into separate arrays for buildParentBlock.
    const delimiters = context.OpenBlockDelimiter ?? [];
    return buildParentBlock(
      delimiters.slice(FIRST, NEXT),
      delimiters.slice(NEXT),
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
      context.QuoteBlockOpen,
      context.QuoteBlockClose,
      "quote",
      children,
    );
  }

  /**
   * Builds a literal paragraph from consecutive indented lines.
   * Each IndentedLine token preserves its leading spaces; we
   * join them with newlines to form the verbatim content.
   */
  literalParagraph(context: LiteralParagraphCstChildren): DelimitedBlockNode {
    const lineTokens = context.IndentedLine ?? [];
    const content = lineTokens.map((t) => t.image).join("\n");

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
  admonitionParagraph(context: AdmonitionParagraphCstChildren): AdmonitionNode {
    return buildAdmonitionParagraph(
      context.AdmonitionMarker?.[FIRST],
      inlineLinesToTextTokens(
        context.inlineLine ?? [],
        context.InlineNewline ?? [],
      ),
    );
  }

  /** Parses attribute entry: name, optional value, unset form. */
  attributeEntry(context: AttributeEntryCstChildren): AttributeEntryNode {
    const token = context.AttributeEntry?.[FIRST];
    const groups =
      token === undefined
        ? undefined
        : ATTRIBUTE_ENTRY_RE.exec(token.image)?.groups;
    // Recovery: missing token or unparseable phantom token.
    if (token === undefined || groups === undefined) {
      return buildRecoveredAttributeEntry(token);
    }
    const { prefixBang, name, suffixBang } = groups;
    const unset = parseUnsetForm(prefixBang, suffixBang);
    // TypeScript types regex groups as `string`, but unmatched
    // optional groups are `undefined` at runtime.
    const rawValue = groups.value as string | undefined;
    const trimmed = rawValue?.trim();
    return {
      type: "attributeEntry",
      name,
      value:
        trimmed === undefined || trimmed.length === EMPTY ? undefined : trimmed,
      unset,
      position: {
        start: tokenStartLocation(token),
        end: tokenEndLocation(token),
      },
    };
  }
}
