// Helper functions for the AST builder's block-level processing.
//
// Extracted from ast-builder.ts to keep that file within the
// max-lines lint limit. These are pure functions that build
// AST nodes from CST tokens or find subrule nodes in the CST.
import type { CstNode, IToken } from "chevrotain";
import type {
  BlockNode,
  DelimitedBlockNode,
  ParentBlockNode,
} from "../ast.js";
import { EMPTY, FIRST, LAST_ELEMENT } from "../constants.js";
import type { BlockCstChildren } from "./cst-types.js";
import type { FlatListItem } from "./list-builder.js";
import {
  tokenStartLocation,
  tokenEndLocation,
} from "./positions.js";

// Index of the second element (close delimiter in a pair of
// open/close delimiter tokens from the same CST array).
const SECOND_DELIMITER = 1;

// Used to skip past newlines when extracting content from
// source text. Assumes LF line endings — safe because
// Prettier normalizes line endings before invoking the parser.
const NEWLINE_LENGTH = 1;

// Checklist marker: `[x] `, `[*] `, or `[ ] ` at the start
// of an unordered list item's text. Group 1 captures the
// inner character so we can distinguish checked from unchecked.
const CHECKBOX_RE = /^\[(?<mark>[x* ])\] /v;
// Length of the checkbox prefix: `[x] ` = 4 characters.
const CHECKBOX_PREFIX_LEN = 4;

// Detects a checklist prefix (`[x] `, `[*] `, `[ ] `) at the
// start of item text. Returns the checkbox state and the text
// with the prefix stripped, or undefined/original text if no
// checkbox is present.
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

// Builds a DelimitedBlockNode from open/close tokens by
// extracting content verbatim from the source text. Same
// substring extraction strategy as blockComment — token-based
// reconstruction would lose blank lines because the CST
// groups tokens by type, not position.
export function buildDelimitedBlock(
  openTokens: IToken[] | undefined,
  closeTokens: IToken[] | undefined,
  variant: DelimitedBlockNode["variant"],
  sourceText: string,
): DelimitedBlockNode {
  const openToken = openTokens?.[FIRST];
  const closeToken = closeTokens?.[FIRST];
  if (openToken === undefined || closeToken === undefined) {
    throw new Error(
      "Delimited block must have opening and closing " +
        "delimiters",
    );
  }

  // Content starts after the open delimiter + newline, and
  // ends before the newline + close delimiter.
  const contentStart =
    openToken.startOffset +
    openToken.image.length +
    NEWLINE_LENGTH;
  const contentEnd =
    closeToken.startOffset - NEWLINE_LENGTH;
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

// Builds a ParentBlockNode from open/close delimiter tokens
// and recursively visited child block nodes.
export function buildParentBlock(
  delimiterTokens: IToken[] | undefined,
  variant: ParentBlockNode["variant"],
  children: BlockNode[],
): ParentBlockNode {
  const openToken = delimiterTokens?.[FIRST];
  const closeToken = delimiterTokens?.[SECOND_DELIMITER];
  if (openToken === undefined || closeToken === undefined) {
    throw new Error(
      "Parent block must have opening and closing " +
        "delimiters",
    );
  }

  return {
    type: "parentBlock",
    variant,
    children,
    position: {
      start: tokenStartLocation(openToken),
      end: tokenEndLocation(closeToken),
    },
  };
}

// Extracts verbatim content between comment delimiters from
// the source text. Same approach as buildDelimitedBlock.
export function extractBlockCommentContent(
  delimiterToken: IToken,
  endToken: IToken,
  sourceText: string,
): string {
  const contentStart =
    delimiterToken.startOffset +
    delimiterToken.image.length +
    NEWLINE_LENGTH;
  const contentEnd =
    endToken.startOffset - NEWLINE_LENGTH;
  return contentStart <= contentEnd
    ? sourceText.slice(contentStart, contentEnd)
    : "";
}

// Builds the common parts of a FlatListItem from text tokens
// and a marker token. Shared by orderedListItem and
// calloutListItem which have identical text-assembly logic.
// The unordered `listItem` visitor does NOT use this because
// it needs checkbox detection (parseCheckbox), which alters
// textStart and the stored value.
// Merges TextContent and IndentedLine tokens into a single
// array sorted by source position. This preserves the original
// line order when both token types appear in a list item.
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
  const allTokens = mergeTextTokens(
    textTokens, options.indentedTokens ?? [],
  );
  const value = allTokens
    .map((t) => t.image.trimStart())
    .join("\n");
  const lastToken =
    allTokens.at(LAST_ELEMENT) ?? markerToken;
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
function findListSubrule(
  context: BlockCstChildren,
): CstNode | undefined {
  return (
    context.unorderedList?.[FIRST] ??
    context.orderedList?.[FIRST] ??
    context.calloutList?.[FIRST]
  );
}

// Checks for any delimited leaf block subrule type (listing,
// literal, passthrough) in the block CST.
function findLeafBlockSubrule(
  context: BlockCstChildren,
): CstNode | undefined {
  return (
    context.listingBlock?.[FIRST] ??
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
  return (
    findLeafBlockSubrule(context) ??
    findParentBlockSubrule(context)
  );
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
function findParagraphSubrule(
  context: BlockCstChildren,
): CstNode | undefined {
  return (
    context.literalParagraph?.[FIRST] ??
    context.admonitionParagraph?.[FIRST] ??
    context.paragraph?.[FIRST]
  );
}

export function findSubrule(
  context: BlockCstChildren,
): CstNode | undefined {
  return (
    context.blockComment?.[FIRST] ??
    context.attributeEntry?.[FIRST] ??
    findListSubrule(context) ??
    findDelimitedBlockSubrule(context) ??
    findParagraphSubrule(context)
  );
}
