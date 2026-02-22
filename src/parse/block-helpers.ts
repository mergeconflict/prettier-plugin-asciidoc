/**
 * Helper functions for the AST builder's block-level processing.
 *
 * Extracted from ast-builder.ts to keep that file within the
 * max-lines lint limit. These are pure functions that build
 * AST nodes from CST tokens or find subrule nodes in the CST.
 */
import type { CstNode, IToken } from "chevrotain";
import type {
  AdmonitionNode,
  AttributeEntryNode,
  BlockNode,
  CommentNode,
  DelimitedBlockNode,
  ParentBlockNode,
} from "../ast.js";
import {
  EMPTY,
  FIRST,
  FIRST_COLUMN,
  FIRST_LINE,
  LAST_ELEMENT,
  NEWLINE_LENGTH,
} from "../constants.js";
import { unreachable } from "../unreachable.js";
import type { BlockCstChildren } from "./cst-types.js";
import type { FlatListItem } from "./list-builder.js";
import {
  makeLocation,
  tokenStartLocation,
  tokenEndLocation,
  computeEnd,
} from "./positions.js";

// Checklist marker: `[x] `, `[*] `, or `[ ] ` at the start
// of an unordered list item's text. Group 1 captures the
// inner character so we can distinguish checked from unchecked.
const CHECKBOX_RE = /^\[(?<mark>[x* ])\] /v;
// Length of the checkbox prefix: `[x] ` = 4 characters.
const CHECKBOX_PREFIX_LEN = 4;

/**
 * Detects a checklist prefix (`[x] `, `[*] `, `[ ] `) at the
 * start of item text. Returns the checkbox state and the text
 * with the prefix stripped, or undefined/original text if no
 * checkbox is present.
 */
export function parseCheckbox(rawValue: string): {
  checkbox: "checked" | "unchecked" | undefined;
  value: string;
  prefixLength: number;
} {
  const match = CHECKBOX_RE.exec(rawValue);
  if (match?.groups === undefined) {
    return {
      checkbox: undefined,
      value: rawValue,
      prefixLength: EMPTY,
    };
  }
  const {
    groups: { mark },
  } = match;
  return {
    checkbox: mark === " " ? "unchecked" : "checked",
    value: rawValue.slice(CHECKBOX_PREFIX_LEN),
    prefixLength: CHECKBOX_PREFIX_LEN,
  };
}

/**
 * Builds a DelimitedBlockNode from open/close tokens by
 * extracting content verbatim from the source text. Same
 * substring extraction strategy as blockComment — token-based
 * reconstruction would lose blank lines because the CST
 * groups tokens by type, not position.
 */
export function buildDelimitedBlock(
  openTokens: IToken[] | undefined,
  closeTokens: IToken[] | undefined,
  variant: DelimitedBlockNode["variant"],
  sourceText: string,
): DelimitedBlockNode {
  // The open token is always present — the grammar can't enter
  // a leaf block rule without first matching the open delimiter.
  const openToken =
    openTokens?.[FIRST] ??
    unreachable("Delimited block must have an opening delimiter");

  const closeToken = closeTokens?.[FIRST];

  // Content starts after the open delimiter + newline.
  const contentStart =
    openToken.startOffset + openToken.image.length + NEWLINE_LENGTH;

  // When the close delimiter is missing (unclosed block — EOF
  // arrived before the matching close), treat everything from
  // the open delimiter to the end of the source as content.
  // This preserves the input verbatim instead of crashing.
  if (closeToken === undefined) {
    const content =
      contentStart <= sourceText.length ? sourceText.slice(contentStart) : "";
    return {
      type: "delimitedBlock",
      variant,
      form: "delimited",
      content,
      position: {
        start: tokenStartLocation(openToken),
        end: computeEnd(sourceText),
      },
    };
  }

  // Normal case: content ends before the newline + close
  // delimiter.
  const contentEnd = closeToken.startOffset - NEWLINE_LENGTH;
  const content =
    contentStart <= contentEnd
      ? sourceText.slice(contentStart, contentEnd)
      : "";

  return {
    type: "delimitedBlock",
    variant,
    form: "delimited",
    content,
    position: {
      start: tokenStartLocation(openToken),
      end: tokenEndLocation(closeToken),
    },
  };
}

/**
 * Builds a ParentBlockNode from open/close delimiter tokens
 * and recursively visited child block nodes.
 */
export function buildParentBlock(
  openTokens: IToken[] | undefined,
  closeTokens: IToken[] | undefined,
  variant: ParentBlockNode["variant"],
  children: BlockNode[],
): ParentBlockNode {
  // The open delimiter is always present — the grammar can't
  // enter a parent block rule without first matching it.
  const openToken =
    openTokens?.[FIRST] ??
    unreachable("Parent block must have an opening delimiter");

  const closeToken = closeTokens?.[FIRST];

  return {
    type: "parentBlock",
    variant,
    children,
    position: {
      start: tokenStartLocation(openToken),
      // When the close delimiter is missing (unclosed block),
      // use the open token's end as a fallback. The block's
      // end will be inaccurate, but this preserves whatever
      // partial content was parsed instead of crashing.
      end:
        closeToken === undefined
          ? tokenEndLocation(openToken)
          : tokenEndLocation(closeToken),
    },
  };
}

/**
 * Extracts verbatim content between comment delimiters from
 * the source text. Same approach as buildDelimitedBlock.
 */
export function extractBlockCommentContent(
  delimiterToken: IToken,
  endToken: IToken,
  sourceText: string,
): string {
  const contentStart =
    delimiterToken.startOffset + delimiterToken.image.length + NEWLINE_LENGTH;
  const contentEnd = endToken.startOffset - NEWLINE_LENGTH;
  return contentStart <= contentEnd
    ? sourceText.slice(contentStart, contentEnd)
    : "";
}

/**
 * Merges TextContent and IndentedLine tokens into a single
 * array sorted by source position. This preserves the original
 * line order when both token types appear in a list item.
 */
export function mergeTextTokens(
  textTokens: IToken[],
  indentedTokens: IToken[],
): IToken[] {
  if (indentedTokens.length === EMPTY) {
    return textTokens;
  }
  return [...textTokens, ...indentedTokens].toSorted(
    (a, b) => a.startOffset - b.startOffset,
  );
}

/**
 * Builds the common parts of a FlatListItem from text tokens
 * and a marker token. Shared by orderedListItem and
 * calloutListItem which have identical text-assembly logic.
 */
export function buildBaseFlatItem(
  markerToken: IToken,
  textTokens: IToken[],
  depth: number,
  options: {
    calloutNumber?: number;
    indentedTokens?: IToken[];
  } = {},
): FlatListItem {
  // Merge TextContent and IndentedLine tokens in source order.
  // IndentedLine images have leading whitespace that must be
  // stripped so the AST value contains clean text.
  const allTokens = mergeTextTokens(textTokens, options.indentedTokens ?? []);
  const value = allTokens.map((t) => t.image.trimStart()).join("\n");
  const lastToken = allTokens.at(LAST_ELEMENT) ?? markerToken;
  return {
    depth,
    value,
    checkbox: undefined,
    calloutNumber: options.calloutNumber,
    start: tokenStartLocation(markerToken),
    end: tokenEndLocation(lastToken),
    textStart:
      allTokens.length > EMPTY
        ? tokenStartLocation(allTokens[FIRST])
        : tokenStartLocation(markerToken),
    textEnd: tokenEndLocation(lastToken),
  };
}

// Finds the first list-type CST subrule in the block context.
// Separated from findSubrule to keep cyclomatic complexity
// under the limit — each nullish-coalescing branch counts.
function findListSubrule(context: BlockCstChildren): CstNode | undefined {
  return (
    context.unorderedList?.[FIRST] ??
    context.orderedList?.[FIRST] ??
    context.calloutList?.[FIRST]
  );
}

// Checks for any delimited leaf block subrule type (listing,
// literal, passthrough, fenced code) in the block CST.
function findLeafBlockSubrule(context: BlockCstChildren): CstNode | undefined {
  return (
    context.listingBlock?.[FIRST] ??
    context.fencedCodeBlock?.[FIRST] ??
    context.literalBlock?.[FIRST] ??
    context.passBlock?.[FIRST]
  );
}

// Checks for any parent block subrule type (example, sidebar,
// open, quote) in the block CST.
function findParentBlockSubrule(
  context: BlockCstChildren,
): CstNode | undefined {
  return (
    context.exampleBlock?.[FIRST] ??
    context.sidebarBlock?.[FIRST] ??
    context.openBlock?.[FIRST] ??
    context.quoteBlock?.[FIRST]
  );
}

// Checks for any delimited block subrule — either leaf blocks
// (verbatim content) or parent blocks (recursive content).
// Combines both helpers into one to keep findSubrule within
// the cyclomatic complexity limit.
function findDelimitedBlockSubrule(
  context: BlockCstChildren,
): CstNode | undefined {
  return findLeafBlockSubrule(context) ?? findParentBlockSubrule(context);
}

// Finds the first CST subrule node present in the block
// context. Extracted to keep the block() visitor under the
// complexity limit — each nullish-coalescing branch counts
// toward cyclomatic complexity.
// Groups the paragraph-like rules: literal paragraphs,
// admonition paragraphs, and regular paragraphs. Order matters —
// literal and admonition paragraphs take priority because they
// have stricter token requirements (IndentedLine or
// AdmonitionMarker) that distinguish them from plain paragraphs.
function findParagraphSubrule(context: BlockCstChildren): CstNode | undefined {
  return (
    context.literalParagraph?.[FIRST] ??
    context.admonitionParagraph?.[FIRST] ??
    context.paragraph?.[FIRST]
  );
}

/**
 * Finds the first CST subrule node present in the block
 * context. Returns `undefined` if recovery produced an empty
 * block CST node.
 */
export function findSubrule(context: BlockCstChildren): CstNode | undefined {
  return (
    context.blockComment?.[FIRST] ??
    context.attributeEntry?.[FIRST] ??
    findListSubrule(context) ??
    findDelimitedBlockSubrule(context) ??
    findParagraphSubrule(context)
  );
}

/**
 * Fallback for list item visitor methods when recovery enters
 * the rule without a marker token. Builds a depth-1 stub from
 * whatever text tokens are available.
 */
const RECOVERY_DEPTH = 1;
export function buildRecoveredListItem(textTokens: IToken[]): FlatListItem {
  const value = textTokens.map((t) => t.image).join("\n");
  const fallback = makeLocation(FIRST, FIRST_LINE, FIRST_COLUMN);
  if (textTokens.length === EMPTY) {
    return {
      depth: RECOVERY_DEPTH,
      value,
      checkbox: undefined,
      calloutNumber: undefined,
      start: fallback,
      end: fallback,
      textStart: fallback,
      textEnd: fallback,
    };
  }
  const start = tokenStartLocation(textTokens[FIRST]);
  const end = tokenEndLocation(
    textTokens.at(LAST_ELEMENT) ?? textTokens[FIRST],
  );
  return {
    depth: RECOVERY_DEPTH,
    value,
    checkbox: undefined,
    calloutNumber: undefined,
    start,
    end,
    textStart: start,
    textEnd: end,
  };
}

/**
 * Determines whether an attribute entry uses `!` prefix or
 * suffix unset syntax, or is a normal set.
 */
export function parseUnsetForm(
  prefix: string,
  suffix: string,
): false | "prefix" | "suffix" {
  if (prefix === "!") return "prefix";
  if (suffix === "!") return "suffix";
  return false;
}

/**
 * Builds a CommentNode from a block comment's CST tokens.
 * Handles unclosed block comments gracefully — when the end
 * delimiter is missing, content extends to EOF.
 */
export function buildBlockComment(
  delimiterToken: IToken,
  endToken: IToken | undefined,
  sourceText: string,
): CommentNode {
  if (endToken === undefined) {
    // Unclosed block comment — EOF arrived before ////.
    const contentStart =
      delimiterToken.startOffset + delimiterToken.image.length + NEWLINE_LENGTH;
    const value =
      contentStart <= sourceText.length ? sourceText.slice(contentStart) : "";
    return {
      type: "comment",
      commentType: "block",
      value,
      position: {
        start: tokenStartLocation(delimiterToken),
        end: computeEnd(sourceText),
      },
    };
  }

  // Extract verbatim content directly from the source text.
  // Token-based reconstruction would lose blank lines inside
  // the comment because the CST groups tokens by type.
  const value = extractBlockCommentContent(
    delimiterToken,
    endToken,
    sourceText,
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

// Colon-space suffix length in admonition markers ("NOTE: ").
const COLON_SPACE_LEN = 2;

/**
 * Builds an AdmonitionNode from a paragraph-form admonition.
 * Handles recovery gracefully when the marker token is missing.
 */
export function buildAdmonitionParagraph(
  markerToken: IToken | undefined,
  textTokens: IToken[],
): AdmonitionNode {
  const content =
    textTokens.length > EMPTY
      ? textTokens.map((t) => t.image).join("\n")
      : undefined;
  const lastTextToken = textTokens.at(LAST_ELEMENT);

  // Recovery entered the rule without a marker token.
  if (markerToken === undefined) {
    const fallback = makeLocation(FIRST, FIRST_LINE, FIRST_COLUMN);
    return {
      type: "admonition",
      variant: "note",
      form: "paragraph",
      delimiter: undefined,
      content,
      children: [],
      position: {
        start: fallback,
        end:
          lastTextToken === undefined
            ? fallback
            : tokenEndLocation(lastTextToken),
      },
    };
  }

  const variant = markerToken.image
    .slice(EMPTY, -COLON_SPACE_LEN)
    .toLowerCase();
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

/**
 * Builds a stub AttributeEntryNode when recovery enters the
 * rule without the expected tokens.
 */
export function buildRecoveredAttributeEntry(
  token: IToken | undefined,
): AttributeEntryNode {
  const fallback = makeLocation(FIRST, FIRST_LINE, FIRST_COLUMN);
  return {
    type: "attributeEntry",
    name: token?.image ?? "",
    value: undefined,
    unset: false,
    position:
      token === undefined
        ? { start: fallback, end: fallback }
        : {
            start: tokenStartLocation(token),
            end: tokenEndLocation(token),
          },
  };
}
