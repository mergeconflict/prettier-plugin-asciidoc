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
 * defined in src/parse/tokens.ts (and src/parse/inline-macro-tokens.ts
 * for the macro subset).
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
// open token + the remaining line text. The threshold for each char
// in this set is MIN_DELIMITER_LENGTH. (Fenced code backticks
// use a shorter prefix and are handled separately.)
const PREFIX_DELIMITER_CHARS = new Set(".-+=*/");

// Specific block constructs not covered by delimiter logic.
const BLOCK_TITLE = /^\.[^ .]/v;
const FENCED_CODE_PREFIX = "```";
const SPECIFIC_PATTERNS = [
  /^<(?:\d+|\.)>$/v, // callout list marker: <1>, <.>
  /^:[!]?[A-Za-z_][\w\-]*[!]?:$/v, // attribute entry: :name:
  /^(?:NOTE|TIP|IMPORTANT|CAUTION|WARNING):$/v, // admonition
  /^\[[^\]]*\]$/v, // block attribute list: [source]
];

// ── Detection ──────────────────────────────────────────────

/**
 * Detect words that would become AsciiDoc block syntax
 * if fill() placed them at column 0. Such words must be
 * glued to their predecessor in wordsToFillParts.
 * @param word - A single non-empty whitespace-delimited token
 *   from the paragraph text, as produced by String.split on
 *   whitespace. Callers guarantee it contains no whitespace.
 * @returns True when the word matches block syntax
 */
function isBlockSyntaxAtLineStart(word: string): boolean {
  // Block title: .Title, .gitignore
  if (BLOCK_TITLE.test(word)) {
    return true;
  }

  // Fenced code block: ```lang
  if (word.startsWith(FENCED_CODE_PREFIX)) {
    return true;
  }

  // Callers guarantee `word` is non-empty, so `first` is
  // always a string (never undefined).
  const [first] = word;
  // Pure delimiter-char word: every character is the same
  // delimiter char. Covers section markers (==), list markers
  // (* - .), block delimiters (---- ****), thematic/page
  // breaks (''' <<<), open block (--), quote block (____).
  // Exception: single `+` is a list continuation only when
  // alone on a line; `+ text` at line start is safe.
  // Multi-char `++++` (passthrough delimiter) IS dangerous.
  if (
    DELIMITER_CHARS.has(first) &&
    isRepeatedChar(word, first) &&
    word !== "+"
  ) {
    return true;
  }

  // Delimiter prefix + text: the lexer greedily matches
  // leading delimiter chars and enters a verbatim mode.
  if (
    PREFIX_DELIMITER_CHARS.has(first) &&
    // Strict `>`: a word of exactly MIN_DELIMITER_LENGTH
    // identical chars (e.g. "----") is already caught by the
    // isRepeatedChar branch above.
    word.length > MIN_DELIMITER_LENGTH &&
    word.startsWith(first.repeat(MIN_DELIMITER_LENGTH))
  ) {
    return true;
  }

  // Remaining specific patterns (callout, attribute entry,
  // admonition, block attribute list).
  return SPECIFIC_PATTERNS.some((pattern) => pattern.test(word));
}

/**
 * Check whether every character in a word is the same
 * character. Used to detect pure delimiter words like
 * `====` or `----`.
 * @param word - The word to test; must be non-empty.
 * @param char - The single character expected at every
 *   position. Callers always pass `word[0]`, so the function
 *   checks uniformity rather than independently choosing the
 *   expected character.
 * @returns True when all characters match `char`
 */
function isRepeatedChar(word: string, char: string): boolean {
  for (const ch of word) {
    if (ch !== char) {
      return false;
    }
  }
  return true;
}

/**
 * Detect words that would become AsciiDoc syntax when
 * placed at end of a line (before a fill() break). Such
 * words are glued to their successor so fill() breaks
 * before the word rather than after it.
 * @param word - A single non-empty whitespace-delimited token
 *   from the paragraph text.
 * @returns True when placing this word at line end would
 *   produce AsciiDoc syntax in the reflowed output
 */
function isDangerousAtLineEnd(word: string): boolean {
  // A bare `+` preceded by a space (from fill() joining)
  // would become ` +\n` — a hard line break.
  return word === "+";
}

// ── Public API ─────────────────────────────────────────────

/**
 * Convert a word list into a Doc array for fill().
 * Words are interleaved with `line` so fill() can break
 * between them. Two safety mechanisms prevent reflow
 * from creating syntax:
 * 1. Words dangerous at line START are glued to their
 *    predecessor so fill() breaks before the pair.
 * 2. Words dangerous at line END (`+`) are glued to
 *    their successor so fill() breaks before them.
 * @param words - Array of whitespace-delimited tokens already
 *   split from the paragraph text. Each element is non-empty
 *   and contains no whitespace. The array itself may be empty,
 *   in which case an empty Doc array is returned.
 * @returns Doc array suitable for Prettier's fill()
 */
export function wordsToFillParts(words: string[]): Doc[] {
  const parts: Doc[] = [];
  // Pending content group: accumulates words that must stay
  // on the same line. Flushed when the next word is safe.
  let pending: Doc | undefined = undefined;
  // When true, the next word must be glued to pending
  // (because pending ends with a line-end-dangerous word).
  let glueNext = false;
  for (const word of words) {
    if (pending === undefined) {
      // First word — nothing to merge with yet.
      pending = word;
    } else if (glueNext || isBlockSyntaxAtLineStart(word)) {
      // Merge with pending: either the previous word is
      // dangerous at line end, or this word is dangerous
      // at line start.
      pending = [pending, " ", word];
      glueNext = false;
    } else {
      // Safe word: flush the pending group and start new.
      if (parts.length > EMPTY) {
        parts.push(line);
      }
      parts.push(pending);
      pending = word;
    }
    // If this word is dangerous at line end, the *next*
    // word must be glued to it.
    if (isDangerousAtLineEnd(word)) {
      glueNext = true;
    }
  }
  // If the last word was dangerous at line end and had no
  // successor to glue to, it will always appear at end of
  // line (the paragraph's last line). Escape it so AsciiDoc
  // doesn't re-parse ` +\n` as a hard line break.
  if (pending === "+") {
    pending = String.raw`\+`;
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
