/**
 * Paragraph reflow safety — prevents fill() from placing words
 * at line-start positions where AsciiDoc would re-parse them as
 * block syntax.
 *
 * When Prettier's fill() wraps text, any word can land at
 * column 0. Words that match block-level lexer tokens at line
 * start (block titles, delimiters, list markers, etc.) must be
 * glued to the preceding word so fill() treats the pair as an
 * indivisible unit.
 *
 * The patterns here mirror the line-start-sensitive tokens
 * defined in src/parse/tokens.ts.
 */
import { doc, type Doc } from "prettier";
import { EMPTY, MIN_DELIMITER_LENGTH } from "./constants.js";

const {
  builders: { line },
} = doc;

// ── Pattern constants ──────────────────────────────────────

// Characters that form block delimiters when repeated. A word
// consisting entirely of one of these (e.g. `====`, `****`,
// `----`, `++++`, `////`, `____`, `'''`, `<<<`, `--`)
// would be re-parsed as block syntax at column 0.
const DELIMITER_CHARS = new Set(".=*-+/'<_");

// Subset of delimiter chars whose lexer patterns do NOT
// require end-of-line, so `====text` is consumed as a block
// open token + verbatim content. The threshold for each char
// in this set is MIN_DELIMITER_LENGTH. (Fenced code backticks
// use a shorter prefix and are handled separately.)
const PREFIX_DELIMITER_CHARS = new Set(".-+=*/");

// Specific block constructs not covered by delimiter logic.
const BLOCK_TITLE = /^\.[^ .]/v;
const FENCED_CODE_PREFIX = "```";
const SPECIFIC_PATTERNS = [
  /^<(?:\d+|\.)>$/v, // callout list marker: <1>, <.>
  /^:[!]?[A-Za-z_][\w\u002D]*[!]?:$/v, // attribute entry: :name:
  /^(?:NOTE|TIP|IMPORTANT|CAUTION|WARNING):$/v, // admonition
  /^\[\[/v, // block anchor: [[id]]
  /^\[[^\]]*\]$/v, // block attribute list: [source]
];

// ── Detection ──────────────────────────────────────────────

// True if `word`, placed at column 0 by fill() reflow, would
// be re-parsed as AsciiDoc block syntax. Such words must be
// glued to their predecessor (see wordsToFillParts).
function isBlockSyntaxAtLineStart(word: string): boolean {
  // Block title: .Title, .gitignore
  if (BLOCK_TITLE.test(word)) {
    return true;
  }

  // Fenced code block: ```lang
  if (word.startsWith(FENCED_CODE_PREFIX)) {
    return true;
  }

  const [first] = word;
  // Pure delimiter-char word: every character is the same
  // delimiter char. Covers section markers (==), list markers
  // (* - .), block delimiters (---- ****), thematic/page
  // breaks (''' <<<), open block (--), quote block (____).
  if (DELIMITER_CHARS.has(first) && isRepeatedChar(word, first)) {
    return true;
  }

  // Delimiter prefix + text: the lexer greedily matches
  // leading delimiter chars and enters a verbatim mode.
  if (
    PREFIX_DELIMITER_CHARS.has(first) &&
    word.length > MIN_DELIMITER_LENGTH &&
    word.startsWith(first.repeat(MIN_DELIMITER_LENGTH))
  ) {
    return true;
  }

  // Remaining specific patterns (callout, attribute entry,
  // admonition, block anchor, block attribute list).
  return SPECIFIC_PATTERNS.some((pattern) => pattern.test(word));
}

// True when every character in `word` is `char`.
function isRepeatedChar(word: string, char: string): boolean {
  for (const ch of word) {
    if (ch !== char) {
      return false;
    }
  }
  return true;
}

// ── Public API ─────────────────────────────────────────────

// Converts a list of words into a Doc array suitable for
// fill(). Words are interleaved with `line` so fill() can
// break between them. Words that would become block syntax at
// line start are merged with their predecessor via a literal
// space, making the pair an indivisible content item — fill()
// will break *before* the pair rather than between them.
export function wordsToFillParts(words: string[]): Doc[] {
  const parts: Doc[] = [];
  // Pending content group: accumulates words that must stay on
  // the same line. Flushed when the next word is safe.
  let pending: Doc | undefined = undefined;
  for (const word of words) {
    if (pending === undefined) {
      // First word — nothing to merge with yet.
      pending = word;
    } else if (isBlockSyntaxAtLineStart(word)) {
      // Dangerous word: merge with predecessor using a literal
      // space so fill() can't break between them.
      pending = [pending, " ", word];
    } else {
      // Safe word: flush the pending group and start a new one.
      if (parts.length > EMPTY) {
        parts.push(line);
      }
      parts.push(pending);
      pending = word;
    }
  }
  // Flush the last pending group.
  if (pending !== undefined) {
    if (parts.length > EMPTY) {
      parts.push(line);
    }
    parts.push(pending);
  }
  return parts;
}
