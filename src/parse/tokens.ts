/* eslint-disable require-unicode-regexp -- Chevrotain's regexp-to-ast does not support the v flag */

/**
 * Chevrotain token definitions for the AsciiDoc lexer.
 *
 * Token definition order matters: Chevrotain uses first-match-wins for tokens
 * that match the same input at the same length. BlankLine must precede Newline
 * (a blank line starts with \n, which Newline would also match), and
 * SectionMarker must precede TextContent (a heading line is also valid text).
 *
 * All tokens containing newlines need `line_breaks: true` so Chevrotain tracks
 * line/column positions correctly through them.
 *
 * Block comments use a multi-mode lexer: when a `////` delimiter is seen, the
 * lexer pushes into `block_comment` mode where everything is captured verbatim
 * until the closing `////` delimiter. This prevents block comment content from
 * being parsed as headings, paragraphs, or other AsciiDoc constructs.
 */
import { createToken, Lexer } from "chevrotain";
import type {
  CustomPatternMatcherFunc,
  CustomPatternMatcherReturn,
  IToken,
} from "chevrotain";
import { EMPTY, MIN_DELIMITER_LENGTH } from "../constants.js";

/**
 * One or more empty/whitespace-only lines. Matches a newline
 * followed by one or more (optional-whitespace + newline)
 * sequences. Must be defined before Newline so the lexer
 * prefers it when applicable.
 */
export const BlankLine = createToken({
  name: "BlankLine",
  pattern: /\n(?:[ \t]*\n)+/,
  line_breaks: true,
});

/** A single line break within a paragraph. */
export const Newline = createToken({
  name: "Newline",
  pattern: /\n/,
  line_breaks: true,
});

/**
 * A heading line starting with 2-6 equals signs followed by
 * space and title text. Must be defined before TextContent
 * so the lexer prefers it for heading lines.
 */
export const SectionMarker = createToken({
  name: "SectionMarker",
  pattern: /={2,6} [^\n]+/,
});

/**
 * Document title: `= Title` (single `=` followed by space and text).
 * Only one `=` sign, unlike SectionMarker which matches `={2,6}`.
 * Placed after SectionMarker in priority order to keep headings
 * grouped logically. The patterns do overlap (`/= [^\n]+/`
 * matches `== Title`), but token priority saves us:
 * SectionMarker appears first in the mode array, so Chevrotain
 * prefers it for any line starting with `={2,6} `.
 */
export const DocumentTitle = createToken({
  name: "DocumentTitle",
  pattern: /= (?!=)[^\n]+/,
});

/**
 * Listing block open delimiter: 4+ dashes on their own line.
 * Pushes into listing_verbatim mode where content is captured
 * verbatim until a matching `----` close delimiter. Must precede
 * BlockCommentDelimiter (which also starts with repeated chars)
 * and TextContent in priority order.
 */
export const ListingBlockOpen = createToken({
  name: "ListingBlockOpen",
  pattern: /-{4,}/,
  push_mode: "listing_verbatim",
});

/**
 * Literal block open delimiter: 4+ dots on their own line.
 * Pushes into literal_verbatim mode. Must precede OrderedListMarker
 * (which also starts with dots) and TextContent.
 */
export const LiteralBlockOpen = createToken({
  name: "LiteralBlockOpen",
  // Negative lookahead prevents matching when the dots are
  // followed by more dots or a space — those are ordered list
  // markers (e.g. `.... text` at depth 4 or `..... text` at
  // depth 5). Delimiters occupy a line by themselves.
  pattern: /\.{4,}(?![. ])/,
  push_mode: "literal_verbatim",
});

/**
 * Passthrough block open delimiter: 4+ plus signs on their own
 * line. Pushes into pass_verbatim mode. Must precede TextContent.
 */
export const PassBlockOpen = createToken({
  name: "PassBlockOpen",
  pattern: /\+{4,}/,
  push_mode: "pass_verbatim",
});

/**
 * Example block delimiter: 4+ equals signs on their own line.
 * Parent blocks stay in default mode (no push_mode) because
 * their content is parsed recursively using normal grammar rules.
 *
 * Negative lookahead prevents matching when followed by a space
 * or more equals signs — those are section headings handled by
 * SectionMarker (`={2,6} text`). A bare `====` (no space, no
 * trailing text) is the example block delimiter.
 */
export const ExampleBlockDelimiter = createToken({
  name: "ExampleBlockDelimiter",
  pattern: /={4,}(?![= ])/,
});

/**
 * Sidebar block delimiter: 4+ asterisks on their own line.
 * No conflict with UnorderedListMarker (`*{1,5} `) because
 * the list marker requires a trailing space; a delimiter is
 * just `****` alone. Parent block — stays in default mode.
 */
export const SidebarBlockDelimiter = createToken({
  name: "SidebarBlockDelimiter",
  // Negative lookahead prevents matching when followed by a
  // space — `**** text` is an unordered list marker at depth 4,
  // not a sidebar delimiter. Also rejects more asterisks after
  // the 5th (though `*{4,}` already won't match `*{6+}`
  // because the list marker only goes to 5).
  pattern: /\*{4,}(?![ *])/,
});

/**
 * Open block delimiter: exactly 2 dashes on their own line.
 * Negative lookahead prevents matching 3+ dashes (those are
 * listing blocks via ListingBlockOpen `/-{4,}/`, or just
 * invalid syntax). Parent block — stays in default mode.
 */
export const OpenBlockDelimiter = createToken({
  name: "OpenBlockDelimiter",
  // Exactly 2 dashes, not followed by another dash or any
  // other character on the same line. AsciiDoc requires `--`
  // to appear on its own line as a block delimiter. Without
  // the negative lookahead, `-- text` would be consumed as
  // an open block delimiter + indented line instead of text.
  pattern: /--(?![^\n])/,
});

/**
 * Quote block delimiter: 4+ underscores on their own line.
 * No conflict with existing tokens. Parent block — stays in
 * default mode.
 */
export const QuoteBlockDelimiter = createToken({
  name: "QuoteBlockDelimiter",
  pattern: /_{4,}/,
});

/**
 * Block comment delimiter: 4+ slashes on their own line.
 * When encountered in default mode, pushes into block_comment mode.
 * When encountered in block_comment mode, pops back to default.
 * Must precede LineComment (which also starts with //) and
 * TextContent in priority order.
 */
export const BlockCommentDelimiter = createToken({
  name: "BlockCommentDelimiter",
  pattern: /\/{4,}/,
  push_mode: "block_comment",
});

/**
 * Closing delimiter inside `block_comment` mode — pops back
 * to default. Chevrotain requires separate push/pop token
 * instances even though the surface syntax is identical to
 * BlockCommentDelimiter.
 */
export const BlockCommentEnd = createToken({
  name: "BlockCommentEnd",
  pattern: /\/{4,}/,
  pop_mode: true,
});

/**
 * Line comment: `//` followed by a space (then optional text)
 * or end of line. `//path` (no space) is NOT a comment.
 * The negative lookahead `(?!\S)` rejects `//` followed by
 * a non-whitespace char — Chevrotain forbids `$` anchors,
 * so we use this pattern instead.
 * Must precede TextContent so the lexer prefers it.
 */
export const LineComment = createToken({
  name: "LineComment",
  pattern: /\/\/(?!\S)[^\n]*/,
});

// Thematic break: three or more single quotes on their own line.
// Must precede TextContent so the lexer prefers it.
export const ThematicBreak = createToken({
  name: "ThematicBreak",
  pattern: /'{3,}/,
});

// Page break: three or more less-than signs on their own line.
// Must precede TextContent so the lexer prefers it.
export const PageBreak = createToken({
  name: "PageBreak",
  pattern: /<{3,}/,
});

/**
 * Verbatim content inside a block comment. Captures everything
 * that is not the closing delimiter line. This token only exists
 * in the block_comment lexer mode.
 */
export const BlockCommentContent = createToken({
  name: "BlockCommentContent",
  pattern: /[^\n]+/,
});

// AsciiDoc requires closing delimiters to be the same character
// AND the same length as the opening delimiter. A `----` must not
// close a `------` block. These custom pattern matchers look back
// through the token array to find the matching open delimiter and
// compare lengths.

/**
 * Build a custom Chevrotain token pattern that only matches a
 * closing delimiter when its length equals the corresponding
 * opening delimiter.
 *
 * @param delimiterChar - Single character (e.g. "-", ".", "+")
 * @param openTokenName - Name of the opening token to match
 *   against (e.g. "ListingBlockOpen")
 */
function makeClosePattern(
  delimiterChar: string,
  openTokenName: string,
): { exec: CustomPatternMatcherFunc } {
  const regex = new RegExp(
    `\\${delimiterChar}{${MIN_DELIMITER_LENGTH},}`,
  );

  return {
    exec: (
      text: string,
      offset: number,
      tokens: IToken[],
      _groups: Record<string, IToken[]>,
    ): CustomPatternMatcherReturn | null => {
      const match = regex.exec(text.slice(offset));
      // eslint-disable-next-line unicorn/no-null -- Chevrotain requires null for no-match
      if (match?.index !== EMPTY) return null;

      // Walk backwards through all previously lexed tokens
      // to find the most recent open delimiter for this block
      // type. The tokens array is shared across all modes.
      const openToken = tokens.findLast(
        (token) => token.tokenType.name === openTokenName,
      );
      const openLength = openToken?.image.length ?? EMPTY;

      // Only match if the close delimiter is exactly the same
      // length as the opening delimiter.
      const [matched] = match;
      // eslint-disable-next-line unicorn/no-null -- Chevrotain requires null for no-match
      if (matched.length !== openLength) return null;

      const result: CustomPatternMatcherReturn = [matched];
      return result;
    },
  };
}

/**
 * Closing delimiter for listing blocks inside listing_verbatim
 * mode. Pops back to default mode. Uses a custom pattern to
 * ensure the close delimiter length matches the open delimiter.
 */
export const ListingBlockClose = createToken({
  name: "ListingBlockClose",
  pattern: makeClosePattern("-", "ListingBlockOpen"),
  pop_mode: true,
  line_breaks: false,
  start_chars_hint: ["-"],
});

/**
 * Closing delimiter for literal blocks inside literal_verbatim
 * mode. Pops back to default mode. Uses a custom pattern to
 * ensure the close delimiter length matches the open delimiter.
 */
export const LiteralBlockClose = createToken({
  name: "LiteralBlockClose",
  pattern: makeClosePattern(".", "LiteralBlockOpen"),
  pop_mode: true,
  line_breaks: false,
  start_chars_hint: ["."],
});

/**
 * Closing delimiter for passthrough blocks inside pass_verbatim
 * mode. Pops back to default mode. Uses a custom pattern to
 * ensure the close delimiter length matches the open delimiter.
 */
export const PassBlockClose = createToken({
  name: "PassBlockClose",
  pattern: makeClosePattern("+", "PassBlockOpen"),
  pop_mode: true,
  line_breaks: false,
  start_chars_hint: ["+"],
});

/**
 * Verbatim content inside a delimited leaf block. Captures any
 * non-newline text that is not a closing delimiter. Shared across
 * all three verbatim modes (listing, literal, pass). Each mode
 * places its specific close token before this one in priority
 * order so the delimiter is matched first.
 */
export const VerbatimContent = createToken({
  name: "VerbatimContent",
  pattern: /[^\n]+/,
});

/**
 * Attribute entry: `:name: value` metadata declaration.
 * Matches `:name:`, `:name: value`, `:!name:`, and `:name!:`.
 * Must precede TextContent so attribute lines aren't consumed as
 * plain text. The regex captures the full line from the opening `:`
 * through the optional value. The `!` for unset can appear before
 * or after the name.
 *
 * The value separator uses `[ \t]` (space/tab) instead of `\s` to
 * prevent the regex from crossing a newline boundary into the next
 * line — important for no-value entries like `:toc:` followed by
 * another attribute entry on the next line.
 *
 * No `^` anchor needed: Chevrotain matches at the current position
 * in the remaining input, which is always line-start after a Newline
 * token. Token priority (before TextContent) ensures attribute lines
 * are recognized first.
 */
export const AttributeEntry = createToken({
  name: "AttributeEntry",
  pattern: /:[!]?[A-Za-z_][\w-]*[!]?:(?:[ \t][^\n]*)?/,
});

/**
 * Block anchor: `[[anchor-id]]` or `[[id,reftext]]` on its own
 * line. Double square brackets distinguish anchors from attribute
 * lists (`[...]`). Must precede BlockAttributeList so `[[` is
 * consumed as an anchor, not an attribute list starting with `[`.
 *
 * The trailing `(?![^\n])` ensures the closing `]]` is at end
 * of line — block anchors occupy a full line by themselves.
 */
export const BlockAnchor = createToken({
  name: "BlockAnchor",
  pattern: /\[\[[^\]]+\]\](?![^\n])/,
});

/**
 * Block attribute list: `[source,ruby]`, `[#myid]`, `[.role]`,
 * `[start=7]`, etc. on its own line. Single square brackets.
 * Must precede TextContent so attribute lists aren't consumed
 * as plain text. BlockAnchor (which starts with `[[`) must be
 * defined before this token.
 *
 * The negative lookahead `(?!\[)` after the opening bracket
 * avoids consuming `[[anchor]]` as an attribute list. The
 * trailing `(?![^\n])` ensures the closing `]` is at end of
 * line — this prevents matching checklist markers (`[x]`,
 * `[ ]`) and other bracketed content that appears mid-line
 * inside list items or paragraphs.
 */
export const BlockAttributeList = createToken({
  name: "BlockAttributeList",
  pattern: /\[(?!\[)[^\]\n]*\](?![^\n])/,
});

/**
 * Block title: `.Title text` — a dot followed by a non-space,
 * non-dot character, then the rest of the line. Must not conflict
 * with LiteralBlockOpen (`....`), which uses 4+ dots, or
 * OrderedListMarker (`. text`), which has a space after the dot.
 * The negative lookahead `(?![. ])` rejects dots and spaces
 * after the initial dot.
 */
export const BlockTitle = createToken({
  name: "BlockTitle",
  pattern: /\.(?![. ])\S[^\n]*/,
});

/**
 * Admonition paragraph marker: `NOTE: `, `TIP: `, `IMPORTANT: `,
 * `CAUTION: `, or `WARNING: ` at the start of a line. AsciiDoc's
 * five admonition types can be written as a label prefix on a
 * paragraph. The marker is consumed separately so the grammar can
 * distinguish admonition paragraphs from regular paragraphs.
 * Must precede TextContent so the lexer prefers it.
 */
export const AdmonitionMarker = createToken({
  name: "AdmonitionMarker",
  pattern: /(?:NOTE|TIP|IMPORTANT|CAUTION|WARNING): /,
});

/**
 * Unordered list item marker: 1–5 `*` characters followed by a space,
 * or a single `-` followed by a space. AsciiDoc uses repeated `*` for
 * nested list levels (`*`, `**`, `***`, etc.) and allows `-` as an
 * alternative level-1 marker. The marker is consumed separately from
 * the item text so the AST builder can determine nesting depth from
 * the marker length. The formatter normalizes `-` to `*`.
 * Must precede TextContent so the lexer prefers it for list lines.
 */
export const UnorderedListMarker = createToken({
  name: "UnorderedListMarker",
  pattern: /(?:\*{1,5}|-) /,
});

/**
 * Ordered list item marker: 1–5 `.` characters followed by a
 * space. AsciiDoc uses repeated dots for nested ordered list
 * levels (`.`, `..`, `...`, etc.). The marker is consumed
 * separately from the item text so the AST builder can
 * determine nesting depth from the marker length.
 * Must precede TextContent so the lexer prefers it.
 *
 * The trailing space distinguishes list markers (`. Item`) from
 * block titles (`.Title`), which have no space after the dot.
 * Block titles will be added in a later task.
 */
export const OrderedListMarker = createToken({
  name: "OrderedListMarker",
  pattern: /\.{1,5} /,
});

/**
 * Callout list item marker: `<N> ` where N is a positive
 * integer, or `<.> ` for auto-numbering. The angle brackets
 * and trailing space distinguish callout markers from other
 * AsciiDoc constructs. Must precede TextContent so the lexer
 * prefers it for callout list lines.
 */
export const CalloutListMarker = createToken({
  name: "CalloutListMarker",
  pattern: /<(?:\d+|\.)> /,
});

/**
 * An indented line: one or more leading spaces followed by
 * non-whitespace content. Indented lines form literal
 * paragraphs (monospace, preserved formatting). Must appear
 * before TextContent so the leading spaces are not consumed
 * by the catch-all.
 */
export const IndentedLine = createToken({
  name: "IndentedLine",
  pattern: / +\S[^\n]*/,
});

/**
 * Catch-all for any non-newline text on a line (default mode).
 * Must be last in the token priority order so that more specific
 * tokens (headings, comments, list markers, etc.) are matched
 * first.
 */
export const TextContent = createToken({
  name: "TextContent",
  pattern: /[^\n]+/,
});

/**
 * Multi-mode lexer definition. The default mode handles normal
 * AsciiDoc content; block_comment mode captures verbatim content
 * between //// delimiters.
 *
 * Token order within each mode determines match priority
 * (first match wins for same-length matches).
 */
const multiModeDefinition = {
  modes: {
    default_mode: [
      BlankLine,
      Newline,
      SectionMarker,
      DocumentTitle,
      // Delimited block openers before BlockCommentDelimiter and
      // LineComment because `----` must not be consumed as text.
      // LiteralBlockOpen uses a negative lookahead to avoid
      // consuming `.... text` as a block (that's an ordered
      // list marker at depth 4).
      ListingBlockOpen,
      LiteralBlockOpen,
      PassBlockOpen,
      // Parent block delimiters stay in default mode (recursive
      // content parsing). Must precede BlockCommentDelimiter and
      // TextContent. ExampleBlockDelimiter has a negative lookahead
      // to avoid matching section headings (`==== Title`).
      ExampleBlockDelimiter,
      SidebarBlockDelimiter,
      OpenBlockDelimiter,
      QuoteBlockDelimiter,
      BlockCommentDelimiter,
      LineComment,
      ThematicBreak,
      PageBreak,
      AttributeEntry,
      BlockAnchor,
      BlockAttributeList,
      BlockTitle,
      AdmonitionMarker,
      UnorderedListMarker,
      OrderedListMarker,
      CalloutListMarker,
      IndentedLine,
      TextContent,
    ],
    block_comment: [
      // BlankLine before Newline (same reason as default mode).
      BlankLine,
      Newline,
      BlockCommentEnd,
      BlockCommentContent,
    ],
    // Each verbatim mode has its specific close token before the
    // shared VerbatimContent so the delimiter is matched first.
    listing_verbatim: [BlankLine, Newline, ListingBlockClose, VerbatimContent],
    literal_verbatim: [BlankLine, Newline, LiteralBlockClose, VerbatimContent],
    pass_verbatim: [BlankLine, Newline, PassBlockClose, VerbatimContent],
  },
  defaultMode: "default_mode",
};

/**
 * Token array for the parser — includes all tokens from both modes.
 * The parser needs to know about every token type even though
 * the lexer only produces them in the appropriate mode.
 */
export const allTokens = [
  BlankLine,
  Newline,
  SectionMarker,
  DocumentTitle,
  ListingBlockOpen,
  ListingBlockClose,
  LiteralBlockOpen,
  LiteralBlockClose,
  PassBlockOpen,
  PassBlockClose,
  ExampleBlockDelimiter,
  SidebarBlockDelimiter,
  OpenBlockDelimiter,
  QuoteBlockDelimiter,
  BlockCommentDelimiter,
  BlockCommentEnd,
  LineComment,
  ThematicBreak,
  PageBreak,
  BlockCommentContent,
  VerbatimContent,
  AttributeEntry,
  BlockAnchor,
  BlockAttributeList,
  BlockTitle,
  AdmonitionMarker,
  UnorderedListMarker,
  OrderedListMarker,
  CalloutListMarker,
  IndentedLine,
  TextContent,
];

/** Reusable lexer instance — stateless, safe to share. */
export const asciidocLexer = new Lexer(multiModeDefinition);
