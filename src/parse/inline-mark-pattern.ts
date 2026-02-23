/**
 * Custom Chevrotain token pattern for inline formatting marks.
 *
 * AsciiDoc's constrained/unconstrained distinction is
 * context-sensitive: whether `*` is a bold marker depends on the
 * characters immediately before and after it. Chevrotain's standard
 * regex patterns cannot inspect surrounding context, so each
 * formatting mark needs a custom matcher that receives the full
 * source text and current offset.
 *
 * Lives in its own file because the boundary logic is substantial
 * enough to deserve independent review and testing, and because
 * tokens.ts would otherwise exceed the max-lines lint limit.
 */
import type {
  CustomPatternMatcherFunc,
  CustomPatternMatcherReturn,
} from "chevrotain";
import { EMPTY, NEXT } from "../constants.js";

// Punctuation that counts as a formatting boundary for
// constrained inline formatting (AsciiDoc spec term,
// distinct from regex \b).
// prettier-ignore
const INLINE_BOUNDARY_PUNCTUATION = new Set([
  ",", ";", ":", "!", "?", ".", "(", ")", "[", "]",
  "{", "}", "<", ">", "/", '"', "'",
  "\u2014", "\u2013", "\u2026",
  // Formatting mark chars are boundaries for each other,
  // enabling nested marks like *_text_* where _ appears
  // immediately after *.
  "*", "_", "`", "#",
  // `+` is a passthrough mark character — it acts as a
  // formatting boundary for adjacent marks but uses a
  // different token mechanism (not makeInlineMarkPattern).
  "+",
]);

const WHITESPACE_RE = /\s/v;

/**
 * Check whether the character at `index` is a constrained
 * formatting boundary (whitespace, punctuation, start/end of
 * text). Callers pass `offset - 1` or `offset + 1` relative to
 * a mark without pre-checking bounds; this function treats
 * out-of-range indices as boundaries so that a mark at the very
 * start or end of text is always valid.
 * @param text - The full source text currently being lexed, not
 *   a substring — boundary checks need the actual character at
 *   the absolute offset.
 * @param index - The absolute character position to test.
 *   May be negative (before start) or >= text.length (past end);
 *   both are treated as boundaries.
 * @returns True when the position is a formatting boundary:
 *   out-of-bounds, whitespace, or AsciiDoc boundary punctuation.
 */
function isInlineBoundary(text: string, index: number): boolean {
  // EMPTY = 0; index < 0 means the caller passed offset - 1 at
  // position 0, i.e. the mark is at the very start of text.
  if (index < EMPTY || index >= text.length) return true;
  // eslint-disable-next-line @typescript-eslint/prefer-destructuring -- string index access
  const ch = text[index];
  return WHITESPACE_RE.test(ch) || INLINE_BOUNDARY_PUNCTUATION.has(ch);
}

/**
 * Build a custom pattern for a constrained/unconstrained
 * inline formatting mark. Double marks (** / __ / `` / ##)
 * match as unconstrained; single marks (* / _ / ` / #) match
 * only adjacent to whitespace, punctuation, or text edges
 * (constrained).
 * @param char - The single formatting character
 *   (e.g. "*", "_", "`", "#")
 * @returns An object with an `exec` method that returns the
 *   matched mark string in a single-element array on success,
 *   or null when the current offset is not a valid mark. Null
 *   tells Chevrotain this token does not match at this position.
 */
export function makeInlineMarkPattern(char: string): {
  exec: CustomPatternMatcherFunc;
} {
  return {
    exec: (text: string, offset: number): CustomPatternMatcherReturn | null => {
      // eslint-disable-next-line unicorn/no-null -- Chevrotain requires null
      if (text[offset] !== char) return null;

      // Try unconstrained (double mark) first.
      if (offset + NEXT < text.length && text[offset + NEXT] === char) {
        return [char + char] as CustomPatternMatcherReturn;
      }

      // Constrained (single mark): a mark is valid as an opening
      // mark when the character immediately before it is a
      // boundary (the mark follows whitespace/punctuation), and
      // valid as a closing mark when the character immediately
      // after it is a boundary (the mark precedes
      // whitespace/punctuation). Either condition suffices —
      // the parser, not the lexer, enforces correct open/close
      // pairing.
      if (isInlineBoundary(text, offset - NEXT)) {
        return [char] as CustomPatternMatcherReturn;
      }
      if (isInlineBoundary(text, offset + NEXT)) {
        return [char] as CustomPatternMatcherReturn;
      }

      // eslint-disable-next-line unicorn/no-null -- Chevrotain requires null
      return null;
    },
  };
}
