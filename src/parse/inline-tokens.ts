/**
 * CST → flat token stream conversion for inline content.
 *
 * This module provides two export paths:
 *
 * 1. Rich inline tree: `flattenInlineTokens` (+ helpers) produces
 *    a merged, sorted IToken stream consumed by inline-node-builder
 *    to build an InlineNode[] tree. The split exists because newline
 *    tokens are captured outside CstNodes by the lexer's multi-mode
 *    design; they must be merged back in before node construction.
 *
 * 2. Flat text: `inlineLinesToTextTokens` (+ `inlineCstToTextTokens`)
 *    produces one synthetic IToken per source line whose `image` is
 *    the joined text. Used by callers (admonitions, list items) that
 *    only need raw text rather than a structured inline tree.
 */
import type { CstNode, IToken } from "chevrotain";
import type { InlineTokenCstChildren } from "./cst-types.js";
import { EMPTY, NEXT } from "../constants.js";

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
  "InlineUrl",
  "LinkMacro",
  "MailtoLink",
  "XrefMacro",
  "XrefShorthand",
  "InlineAnchor",
  "HardLineBreak",
  "InlineText",
  "InlineChar",
];

/**
 * Extract inlineToken CstNodes from inlineLine subrule nodes.
 * The grammar uses a dedicated `inlineLine` rule (rather than
 * inlining `inlineToken*` directly) because each line starts
 * with `InlineModeStart`, a zero-length token that pushes the
 * lexer into inline mode. That structural wrapper must be
 * stripped here so downstream code can iterate tokens without
 * knowing about the per-line grammar nesting.
 * @param inlineLineNodes - CstNodes produced by the
 *   `inlineLine` parser subrule, each wrapping one
 *   `InlineModeStart` token followed by zero or more
 *   `inlineToken` children.
 * @returns Flat array of `inlineToken` CstNodes extracted
 *   from all line wrappers, preserving parse order.
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
 * Extract all ITokens from inlineToken CstNode children,
 * merge with InlineNewline tokens, and return them sorted
 * by source offset. This produces the single interleaved
 * token stream that downstream inline processing expects.
 * @param inlineTokenNodes - CstNodes from the `inlineToken`
 *   OR rule, each containing exactly one matched alternative.
 * @param inlineNewlineTokens - Newline tokens captured
 *   separately by the lexer (not inside CstNodes) that must
 *   be merged back into the stream.
 * @returns Merged token array sorted by `startOffset`.
 */
export function flattenInlineTokens(
  inlineTokenNodes: CstNode[],
  inlineNewlineTokens: IToken[],
): IToken[] {
  // Collect inline tokens — already in source order because
  // CstNodes appear in parse order and each node contains
  // exactly one token from the OR alternatives.
  const inlineTokens: IToken[] = [];
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
          inlineTokens.push(tok);
        }
      }
    }
  }

  // Both arrays are sorted by startOffset. Merge them in
  // O(n) instead of the previous O(n log n) sort.
  return mergeSortedTokens(inlineTokens, inlineNewlineTokens);
}

/**
 * Merge two pre-sorted token arrays into one sorted array.
 * Uses a linear O(n) merge rather than concatenate-and-sort
 * O(n log n), which matters when inline content is large.
 *
 * **Precondition:** both inputs must already be ordered by
 * `startOffset`. Passing unsorted arrays produces incorrect
 * output silently — the merge has no way to detect it.
 * @param left - First sorted token array (inline content
 *   tokens extracted from CstNodes).
 * @param right - Second sorted token array (newline or
 *   indented-line tokens captured outside CstNodes by the
 *   lexer's multi-mode design).
 * @returns Single array containing all tokens from both
 *   inputs, sorted by `startOffset`.
 */
export function mergeSortedTokens(left: IToken[], right: IToken[]): IToken[] {
  // When one side is empty, return early. `left` is returned
  // as-is (no copy) because the caller already owns it and
  // the merge loop below never mutates it. `right` is spread
  // to ensure the caller receives a new array in both paths
  // (consistent ownership semantics).
  if (right.length === EMPTY) return left;
  if (left.length === EMPTY) return [...right];

  const merged: IToken[] = [];
  let leftIndex = EMPTY;
  let rightIndex = EMPTY;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex].startOffset <= right[rightIndex].startOffset) {
      merged.push(left[leftIndex]);
      leftIndex += NEXT;
    } else {
      merged.push(right[rightIndex]);
      rightIndex += NEXT;
    }
  }
  // Append remaining elements from whichever array isn't
  // exhausted.
  while (leftIndex < left.length) {
    merged.push(left[leftIndex]);
    leftIndex += NEXT;
  }
  while (rightIndex < right.length) {
    merged.push(right[rightIndex]);
    rightIndex += NEXT;
  }
  return merged;
}

/**
 * Reconstruct synthetic IToken[] from inline CST nodes, one
 * token per source line. Callers like admonition and list
 * item checkbox detection need flat text rather than a rich
 * inline node tree, so this joins each line's tokens into a
 * single synthetic token whose `image` is the concatenated
 * text.
 * @param inlineTokenNodes - CstNodes from the `inlineToken`
 *   OR rule (already unwrapped from line wrappers).
 * @param inlineNewlineTokens - Newline tokens used to
 *   detect line boundaries when grouping.
 * @returns One synthetic IToken per non-empty source line,
 *   with `image` set to the joined text and `startOffset`/
 *   `endOffset` spanning first-to-last token on that line.
 *   Position spans are preserved so callers can use them for
 *   offset-based range tracking and error recovery.
 */
export function inlineCstToTextTokens(
  inlineTokenNodes: CstNode[],
  inlineNewlineTokens: IToken[],
): IToken[] {
  if (inlineTokenNodes.length === EMPTY) return [];

  const allTokens = flattenInlineTokens(inlineTokenNodes, inlineNewlineTokens);

  // Group tokens by line (split at InlineNewline boundaries).
  // Callers like admonition detection and checkbox parsing
  // work line-by-line, so each synthetic output token must
  // correspond to exactly one source line.
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

/**
 * Convert `inlineLine` CST nodes to synthetic text-content
 * tokens (one per line). Convenience wrapper that unwraps
 * line nodes and delegates to {@link inlineCstToTextTokens}.
 * Used by list items and admonitions that store their body
 * as a plain string rather than an InlineNode[] tree.
 * @param inlineLineNodes - CstNodes from the `inlineLine`
 *   subrule, each wrapping `inlineToken` children.
 * @param inlineNewlineTokens - Newline tokens for detecting
 *   line boundaries during grouping.
 * @returns One synthetic IToken per non-empty source line,
 *   with concatenated text in `image`.
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
