/**
 * Builds InlineNode[] from the Chevrotain CST's inline tokens.
 *
 * This replaces the hand-rolled `tokenizeInline()` character
 * scanner. Instead of re-scanning raw text, we take the flat
 * token stream that the lexer already produced (BoldMark,
 * InlineText, AttributeReference, etc.) and pair formatting
 * marks into nested spans.
 *
 * The algorithm:
 * 1. Flatten all ITokens from the `inlineToken` CstNode array,
 *    merge with InlineNewline tokens, sort by source offset.
 * 2. Walk the token stream:
 *    - Plain text tokens → accumulate into pending text.
 *    - AttributeReference → flush text, emit node.
 *    - RoleAttribute + HighlightMark → pair into highlight span.
 *    - Formatting marks → scan forward for matching close,
 *      recursively build children.
 *    - Unmatched marks fall through as plain text.
 */
import type { CstNode, IToken } from "chevrotain";
import type {
  InlineNode,
  TextNode,
  BoldNode,
  ItalicNode,
  MonospaceNode,
  HighlightNode,
  AttributeReferenceNode,
} from "../ast.js";
import type { InlineTokenCstChildren } from "./cst-types.js";
import { tokenStartLocation, tokenEndLocation } from "./positions.js";
import { EMPTY, NEXT } from "../constants.js";
import { unreachable } from "../unreachable.js";

// Map from mark token name to AST node type.
const MARK_TO_TYPE: Record<
  string,
  "bold" | "italic" | "monospace" | "highlight"
> = {
  BoldMark: "bold",
  ItalicMark: "italic",
  MonoMark: "monospace",
  HighlightMark: "highlight",
};

const MARK_TOKEN_NAMES = new Set(Object.keys(MARK_TO_TYPE));

// The known property names on InlineTokenCstChildren, used
// to extract ITokens from each inlineToken CstNode without
// unsafe type assertions on Object.keys().
const INLINE_TOKEN_KEYS: ReadonlyArray<keyof InlineTokenCstChildren> = [
  "BoldMark",
  "ItalicMark",
  "MonoMark",
  "HighlightMark",
  "RoleAttribute",
  "AttributeReference",
  "BackslashEscape",
  "InlineText",
  "InlineChar",
];

// Sentinel returned by findCloseMark when no match is found.
const NOT_FOUND = -1;

/**
 * Build InlineNode[] from the inlineToken CST nodes produced
 * by the Chevrotain parser's inline mode.
 */
export function buildInlineNodes(
  inlineTokenNodes: CstNode[],
  inlineNewlineTokens: IToken[],
): InlineNode[] {
  const tokens = flattenInlineTokens(inlineTokenNodes, inlineNewlineTokens);
  return buildFromTokens(tokens);
}

/**
 * Extract inlineToken CstNodes from inlineLine subrule nodes.
 * The inlineLine rule wraps InlineModeStart + inlineToken* into
 * a single CstNode; this unwraps it.
 */
export function unwrapInlineLines(inlineLineNodes: CstNode[]): CstNode[] {
  const inlineTokenNodes: CstNode[] = [];
  for (const lineNode of inlineLineNodes) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Chevrotain CstNode children are untyped
    const children = lineNode.children as Record<string, CstNode[] | undefined>;
    const { inlineToken: tokenNodes } = children;
    if (tokenNodes !== undefined) {
      for (const tok of tokenNodes) {
        inlineTokenNodes.push(tok);
      }
    }
  }
  return inlineTokenNodes;
}

/**
 * Build InlineNode[] from the `inlineLine` CST subrule nodes.
 * Each inlineLine CstNode contains InlineModeStart and
 * inlineToken children. This unwraps them before delegating
 * to the core buildInlineNodes.
 */
export function buildInlineNodesFromLines(
  inlineLineNodes: CstNode[],
  inlineNewlineTokens: IToken[],
): InlineNode[] {
  return buildInlineNodes(
    unwrapInlineLines(inlineLineNodes),
    inlineNewlineTokens,
  );
}

/**
 * Convert `inlineLine` CST nodes to synthetic text-content
 * tokens (one per line). Used by list items and admonitions
 * that store text as a string value, not InlineNode[].
 */
export function inlineLinesToTextTokens(
  inlineLineNodes: CstNode[],
  inlineNewlineTokens: IToken[],
): IToken[] {
  return inlineCstToTextTokens(
    unwrapInlineLines(inlineLineNodes),
    inlineNewlineTokens,
  );
}

/**
 * Extract all ITokens from inlineToken CstNode children,
 * merge with InlineNewline tokens, and sort by source offset.
 */
export function flattenInlineTokens(
  inlineTokenNodes: CstNode[],
  inlineNewlineTokens: IToken[],
): IToken[] {
  const tokens: IToken[] = [];
  for (const node of inlineTokenNodes) {
    // Each CstNode's children is a record whose values are
    // IToken arrays — one per matched alternative in the
    // `inlineToken` OR rule.
    const children = node.children as InlineTokenCstChildren;
    for (const key of INLINE_TOKEN_KEYS) {
      // eslint-disable-next-line @typescript-eslint/prefer-destructuring -- dynamic key access
      const tokenArray = children[key];
      if (tokenArray !== undefined) {
        for (const tok of tokenArray) {
          tokens.push(tok);
        }
      }
    }
  }
  // InlineNewline tokens represent \n between lines within
  // a paragraph — needed for text reconstruction.
  for (const tok of inlineNewlineTokens) {
    tokens.push(tok);
  }
  return tokens.toSorted((a, b) => a.startOffset - b.startOffset);
}

/**
 * Reconstruct synthetic IToken[] from inline CST nodes, one
 * token per source line. This lets list items and admonitions
 * reuse the existing `mergeTextTokens` / `buildBaseFlatItem`
 * helpers that expect inline text-shaped tokens.
 */
export function inlineCstToTextTokens(
  inlineTokenNodes: CstNode[],
  inlineNewlineTokens: IToken[],
): IToken[] {
  if (inlineTokenNodes.length === EMPTY) return [];

  const allTokens = flattenInlineTokens(inlineTokenNodes, inlineNewlineTokens);

  // Group tokens by line (split at InlineNewline tokens).
  const lines: IToken[][] = [[]];
  for (const token of allTokens) {
    const {
      tokenType: { name },
    } = token;
    if (name === "InlineNewline") {
      lines.push([]);
    } else {
      // eslint-disable-next-line @typescript-eslint/prefer-destructuring -- dynamic last-element access
      const currentLine = lines[lines.length - NEXT];
      currentLine.push(token);
    }
  }

  // Create one synthetic token per line with the joined text.
  return lines
    .filter((line) => line.length > EMPTY)
    .map((lineTokens) => {
      const [first] = lineTokens;
      // eslint-disable-next-line @typescript-eslint/prefer-destructuring -- dynamic last-element access
      const last = lineTokens[lineTokens.length - NEXT];
      return {
        ...first,
        image: lineTokens.map((t) => t.image).join(""),
        // Keep start position from first token on the line.
        // Adjust end position based on the last token.
        endOffset: last.endOffset,
        endLine: last.endLine,
        endColumn: last.endColumn,
      };
    });
}

// -------------------------------------------------------
// Internal: token-stream → InlineNode[] builder
// -------------------------------------------------------

// Look up the AST type name for a given mark token name.
// Returns undefined if the token name is not a formatting mark.
function lookupMarkType(
  markTokenName: string,
): "bold" | "italic" | "monospace" | "highlight" | undefined {
  return MARK_TO_TYPE[markTokenName];
}

// Scan forward from `openIndex` for a matching close mark of
// the same token type and image length (constrained vs.
// unconstrained).
//
// Returns the index of the matching close mark, or -1 if none.
function findCloseMark(tokens: IToken[], openIndex: number): number {
  // eslint-disable-next-line @typescript-eslint/prefer-destructuring -- indexed array access
  const openToken = tokens[openIndex];
  const {
    tokenType: { name: markName },
    image: { length: markLength },
  } = openToken;

  for (
    let scanIndex = openIndex + NEXT;
    scanIndex < tokens.length;
    scanIndex += NEXT
  ) {
    // eslint-disable-next-line @typescript-eslint/prefer-destructuring -- indexed array access
    const candidate = tokens[scanIndex];
    const { tokenType, image } = candidate;
    if (tokenType.name === markName && image.length === markLength) {
      return scanIndex;
    }
  }
  return NOT_FOUND;
}

// Build a TextNode from accumulated pending text.
function makeTextNode(value: string, first: IToken, last: IToken): TextNode {
  return {
    type: "text",
    value,
    position: {
      start: tokenStartLocation(first),
      end: tokenEndLocation(last),
    },
  };
}

// Parameters for makeFormattingNode.
interface FormattingNodeOptions {
  markTokenName: string;
  constrained: boolean;
  children: InlineNode[];
  openMark: IToken;
  closeMark: IToken;
}

// Create a formatting AST node (bold, italic, monospace, or
// highlight without a role).
function makeFormattingNode(
  options: FormattingNodeOptions,
): BoldNode | ItalicNode | MonospaceNode | HighlightNode {
  const { markTokenName, constrained, children, openMark, closeMark } = options;
  const type = lookupMarkType(markTokenName);
  const position = {
    start: tokenStartLocation(openMark),
    end: tokenEndLocation(closeMark),
  };
  const base = { constrained, children, position };
  switch (type) {
    case "bold": {
      return { type, ...base };
    }
    case "italic": {
      return { type, ...base };
    }
    case "monospace": {
      return { type, ...base };
    }
    case "highlight": {
      return { type, role: undefined, ...base };
    }
    case undefined: {
      return unreachable(`Unknown mark token: ${markTokenName}`);
    }
  }
}

// Build an AttributeReferenceNode from a {name} token.
function makeAttributeReference(token: IToken): AttributeReferenceNode {
  return {
    type: "attributeReference",
    name: token.image.slice(NEXT, -NEXT),
    position: {
      start: tokenStartLocation(token),
      end: tokenEndLocation(token),
    },
  };
}

// Parameters for handleRoleAttribute.
interface RoleAttributeContext {
  tokens: IToken[];
  index: number;
  token: IToken;
  flushText: () => void;
  accumulate: (token: IToken, text: string) => void;
  nodes: InlineNode[];
}

// Handle a RoleAttribute token. If it pairs with a following
// highlight mark, emit a HighlightNode. Otherwise accumulate
// as text. Returns the next index.
function handleRoleAttribute(context: RoleAttributeContext): number {
  const { tokens, index, token, flushText, accumulate, nodes } = context;
  const { image: roleImage } = token;
  const roleText = roleImage.slice(NEXT, -NEXT);
  const nextIndex = index + NEXT;

  if (
    nextIndex < tokens.length &&
    tokens[nextIndex].tokenType.name === "HighlightMark"
  ) {
    const closeIndex = findCloseMark(tokens, nextIndex);
    if (closeIndex >= EMPTY) {
      flushText();
      // eslint-disable-next-line @typescript-eslint/prefer-destructuring -- indexed array access
      const openMark = tokens[nextIndex];
      // eslint-disable-next-line @typescript-eslint/prefer-destructuring -- indexed array access
      const closeMark = tokens[closeIndex];
      const innerTokens = tokens.slice(nextIndex + NEXT, closeIndex);
      const children = buildFromTokens(innerTokens);
      const constrained = openMark.image.length === NEXT;
      const highlightNode: HighlightNode = {
        type: "highlight",
        constrained,
        role: roleText,
        children,
        position: {
          start: tokenStartLocation(token),
          end: tokenEndLocation(closeMark),
        },
      };
      nodes.push(highlightNode);
      return closeIndex + NEXT;
    }
  }

  // No matching highlight — treat as text.
  accumulate(token, token.image);
  return index + NEXT;
}

// Try to pair a formatting mark with its close. Returns the
// node and next index if paired, undefined otherwise.
function handleFormattingMark(
  tokens: IToken[],
  index: number,
  token: IToken,
  tokenName: string,
): { node: InlineNode; nextIndex: number } | undefined {
  const closeIndex = findCloseMark(tokens, index);
  if (closeIndex < EMPTY) return undefined;

  const innerTokens = tokens.slice(index + NEXT, closeIndex);
  const children = buildFromTokens(innerTokens);
  const constrained = token.image.length === NEXT;
  // eslint-disable-next-line @typescript-eslint/prefer-destructuring -- indexed array access
  const closeMark = tokens[closeIndex];
  return {
    node: makeFormattingNode({
      markTokenName: tokenName,
      constrained,
      children,
      openMark: token,
      closeMark,
    }),
    nextIndex: closeIndex + NEXT,
  };
}

// Walk the flat, sorted token stream and build InlineNode[].
//
// Formatting marks are paired greedily: each open mark scans
// forward for the nearest matching close of the same type and
// length, then the content between them is recursively built.
//
// The function delegates to helper functions that each handle
// one token category (role highlights, formatting marks,
// attribute references, plain text).
function buildFromTokens(allTokens: IToken[]): InlineNode[] {
  // Strip trailing InlineNewline — it's a structural
  // separator (paragraph boundary), not inline content.
  // Only between-line newlines should become \n text.
  const { length: tokenCount } = allTokens;
  let end = tokenCount;
  while (
    end > EMPTY &&
    allTokens[end - NEXT].tokenType.name === "InlineNewline"
  ) {
    end -= NEXT;
  }
  const tokens = end < tokenCount ? allTokens.slice(EMPTY, end) : allTokens;

  const nodes: InlineNode[] = [];
  let pendingText = "";
  let pendingStart: IToken | undefined = undefined;
  let pendingEnd: IToken | undefined = undefined;
  let index = EMPTY;

  // Flush accumulated plain text into a TextNode.
  function flushText(): void {
    if (
      pendingText.length > EMPTY &&
      pendingStart !== undefined &&
      pendingEnd !== undefined
    ) {
      nodes.push(makeTextNode(pendingText, pendingStart, pendingEnd));
      pendingText = "";
      pendingStart = undefined;
      pendingEnd = undefined;
    }
  }

  // Accumulate a token into pending text.
  function accumulate(token: IToken, text: string): void {
    pendingStart ??= token;
    pendingEnd = token;
    pendingText += text;
  }

  while (index < tokens.length) {
    // eslint-disable-next-line @typescript-eslint/prefer-destructuring -- indexed array access
    const token = tokens[index];
    const {
      tokenType: { name: tokenName },
    } = token;

    // Dispatch to category-specific handlers.
    if (tokenName === "RoleAttribute") {
      index = handleRoleAttribute({
        tokens,
        index,
        token,
        flushText,
        accumulate,
        nodes,
      });
      continue;
    }

    if (MARK_TOKEN_NAMES.has(tokenName)) {
      const result = handleFormattingMark(tokens, index, token, tokenName);
      if (result !== undefined) {
        flushText();
        const { node, nextIndex } = result;
        nodes.push(node);
        index = nextIndex;
        continue;
      }
      // No matching close — fall through as plain text.
    }

    if (tokenName === "AttributeReference") {
      flushText();
      nodes.push(makeAttributeReference(token));
      index += NEXT;
      continue;
    }

    // InlineNewline → \n, everything else → literal image.
    const text = tokenName === "InlineNewline" ? "\n" : token.image;
    accumulate(token, text);
    index += NEXT;
  }

  flushText();
  return nodes;
}
