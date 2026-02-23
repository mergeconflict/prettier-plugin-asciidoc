/**
 * Continuation-line logic for list item inline content.
 *
 * List items can span multiple lines. Lines that begin with
 * inline-eligible content are lexed in inline mode and
 * produce inlineLine CST nodes; plain continuation lines are
 * lexed in default mode and produce IndentedLine tokens.
 * Both token streams must be merged by source offset so that
 * buildFromTokens sees a single unified, offset-sorted stream
 * — otherwise continuation lines would be silently dropped or
 * appended out of order, corrupting HardLineBreak positions
 * and other inline constructs.
 */
import type { CstNode, IToken } from "chevrotain";
import type { InlineNode } from "../ast.js";
import { InlineNewline } from "./tokens.js";
import { buildFromTokens } from "./inline-node-builder.js";
import {
  flattenInlineTokens,
  mergeSortedTokens,
  unwrapInlineLines,
} from "./inline-tokens.js";

/**
 * Build InlineNode[] from inline lines plus default_mode
 * continuation tokens (IndentedLine, Newline from MANY3).
 * @param inlineLineNodes - CST nodes produced by the
 *   inline-mode grammar rule, one per continuation line
 *   lexed in inline mode. Each node wraps the sequence of
 *   inline tokens for that line.
 * @param inlineNewlineTokens - InlineNewline tokens
 *   emitted by the lexer's pop-mode rule at the end of
 *   each inline-mode line. These terminate inline mode;
 *   they are separate from defaultModeNewlineTokens
 *   because the two modes capture newlines independently.
 * @param indentedLineTokens - Whole-line tokens produced
 *   in default mode for plain continuation lines. Each
 *   token's image includes its leading whitespace, which
 *   is stripped before merging.
 * @param defaultModeNewlineTokens - Newline tokens
 *   captured in the default-mode MANY3 continuation
 *   loop. Kept separate from inlineNewlineTokens because
 *   the two lexer modes accumulate them independently;
 *   they are re-typed to InlineNewline before merging so
 *   buildFromTokens handles them uniformly.
 * @returns Offset-sorted InlineNode array ready for the
 *   printer; trailing newlines have been stripped by
 *   buildFromTokens.
 */
export function buildInlineNodesWithContinuation(
  inlineLineNodes: CstNode[],
  inlineNewlineTokens: IToken[],
  indentedLineTokens: IToken[],
  defaultModeNewlineTokens: IToken[],
): InlineNode[] {
  // buildFromTokens dispatches on tokenType, not on which
  // lexer mode produced the token. Default-mode Newline
  // tokens serve the same line-boundary role as InlineNewline
  // tokens, so we re-type them as InlineNewline here to get
  // uniform handling: accumulate as "\n", strip trailing
  // newlines at the end of the item, and skip the structural
  // newline that immediately follows a HardLineBreak.
  const convertedNewlines = defaultModeNewlineTokens.map((t) => ({
    ...t,
    tokenType: InlineNewline,
  }));
  const allNewlines = mergeSortedTokens(inlineNewlineTokens, convertedNewlines);

  // Phase 1: build the inline-mode portion of the stream.
  // unwrapInlineLines extracts the per-token CstNodes from
  // each inlineLine, then flattenInlineTokens turns those
  // CstNodes into ITokens and merges them with allNewlines
  // in one offset-sorted pass. The result contains all
  // tokens that came from inline-mode lines, newlines
  // included.
  const inlineStream = flattenInlineTokens(
    unwrapInlineLines(inlineLineNodes),
    allNewlines,
  );

  // Phase 2: merge the inline-mode stream with the
  // default-mode continuation lines.
  // IndentedLine token images include leading whitespace
  // (the indentation that makes a line a continuation).
  // Strip it so the AST contains clean content text rather
  // than the raw indented source.
  const trimmedIndented = indentedLineTokens.map((t) => ({
    ...t,
    image: t.image.trimStart(),
  }));
  const combined = mergeSortedTokens(inlineStream, trimmedIndented);

  return buildFromTokens(combined);
}
