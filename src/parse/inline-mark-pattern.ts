/**
 * Inline mark pattern helper for the Chevrotain lexer.
 *
 * Extracted from tokens.ts to keep that file within
 * the max-lines lint limit. Builds custom token patterns
 * for constrained/unconstrained inline formatting marks.
 */
import type {
  CustomPatternMatcherFunc,
  CustomPatternMatcherReturn,
} from "chevrotain";
import { EMPTY, NEXT } from "../constants.js";

// Punctuation that counts as a word boundary for constrained
// inline formatting (single mark like *word*).
// prettier-ignore
const INLINE_BOUNDARY_PUNCTUATION = new Set([
  ",", ";", ":", "!", "?", ".", "(", ")", "[", "]",
  "{", "}", "<", ">", "/", '"', "'",
  "\u2014", "\u2013", "\u2026",
  // Formatting mark chars are boundaries for each other,
  // enabling nested marks like *_text_* where _ appears
  // immediately after *.
  "*", "_", "`", "#",
]);

const WHITESPACE_RE = /\s/v;

// Check whether the character at `index` is an inline boundary
// (whitespace, punctuation, or out-of-bounds).
function isInlineBoundary(text: string, index: number): boolean {
  if (index < EMPTY || index >= text.length) return true;
  // eslint-disable-next-line @typescript-eslint/prefer-destructuring -- string index access
  const ch = text[index];
  return WHITESPACE_RE.test(ch) || INLINE_BOUNDARY_PUNCTUATION.has(ch);
}

/**
 * Build a custom pattern for a constrained/unconstrained
 * inline formatting mark. Double marks (** / __ / `` / ##)
 * match as unconstrained; single marks (* / _ / ` / #) match
 * only at word boundaries (constrained).
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

      // Constrained (single mark): needs word boundary before
      // or after.
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
