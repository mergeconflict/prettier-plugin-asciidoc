/**
 * Factory functions for building LinkNode, XrefNode, and
 * InlineAnchorNode from their respective lexer tokens.
 *
 * Each public function takes the raw Chevrotain token produced
 * by the inline lexer and returns the corresponding AST node
 * with source positions. String splitting is used throughout
 * instead of regex to stay within the project's lint rules
 * (no named capture groups, no unicode flags, no magic-number
 * group indices).
 */
import type { IToken } from "chevrotain";
import type { LinkNode, XrefNode, InlineAnchorNode } from "../ast.js";
import { EMPTY, NEXT } from "../constants.js";
import { tokenStartLocation, tokenEndLocation } from "./positions.js";

// Number of characters in `<<`, `>>`, `[[`, or `]]`.
const BRACKET_PAIR_LEN = 2;

// ── String splitting helpers ────────────────────────────────

// Sentinel for indexOf when no match is found.
const NOT_FOUND = -1;

/**
 * Split a string at the first `[` to separate the target
 * from the bracket-enclosed display text.
 *
 * Called with either a full token image (bare-URL tokens)
 * or the already-prefix-stripped portion of a macro token
 * (link:, mailto:, xref: callers strip their prefix first).
 * The input is always expected to end with `]` when a bracket
 * is present — the trailing `]` is consumed by the slice.
 * @param image - String to split; either a full token image
 *   or the portion after a macro prefix has been removed
 * @returns Tuple of [beforeBracket, insideBracket].
 *   insideBracket is undefined only when no `[` is present
 *   (bare URL with no label, e.g. `"https://example.com"`).
 */
function splitAtBracket(image: string): [string, string | undefined] {
  const bracketIndex = image.indexOf("[");
  if (bracketIndex === NOT_FOUND) {
    return [image, undefined];
  }
  const before = image.slice(EMPTY, bracketIndex);
  // Slice between `[` and the final `]`.
  const inside = image.slice(bracketIndex + NEXT, -NEXT);
  return [before, inside];
}

/**
 * Extract start/end source positions from a Chevrotain
 * token for AST location tracking.
 * @param token - Chevrotain token with offset/line/col
 * @returns Object with `start` and `end` pointing to the
 *   first and last characters of the token in the source,
 *   ready to attach to an AST node's `position` field
 */
function positionOf(token: IToken): {
  start: ReturnType<typeof tokenStartLocation>;
  end: ReturnType<typeof tokenEndLocation>;
} {
  return {
    start: tokenStartLocation(token),
    end: tokenEndLocation(token),
  };
}

// ── Public factory functions ────────────────────────────────

/**
 * Build a LinkNode from a bare-URL token.
 *
 * Handles both `https://example.com` (no display text)
 * and `https://example.com[label]` (with display text).
 * The form is always `"url"` to distinguish from the
 * explicit `link:` macro during round-trip formatting.
 * @param token - InlineUrl token from the lexer
 * @returns LinkNode with form `"url"`
 */
export function makeLinkFromUrl(token: IToken): LinkNode {
  const [target, text] = splitAtBracket(token.image);
  return {
    type: "link",
    form: "url",
    target,
    text: text === undefined || text.length === EMPTY ? undefined : text,
    position: positionOf(token),
  };
}

/**
 * Build a LinkNode from a `link:` or `mailto:` macro token.
 *
 * Strips the macro prefix to extract the target, then
 * splits at `[` for optional display text. For `mailto:`
 * tokens the full `mailto:addr` is preserved as the
 * target so the printer can reproduce the original form.
 * @param token - LinkMacro or MailtoLink token from the
 *   lexer (image starts with `link:` or `mailto:`)
 * @returns LinkNode with form `"macro"`
 */
export function makeLinkFromMacro(token: IToken): LinkNode {
  // Strip the prefix (`link:` or `mailto:`).
  const isMailto = token.image.startsWith("mailto:");
  const afterPrefix = isMailto
    ? token.image.slice("mailto:".length)
    : token.image.slice("link:".length);
  // afterPrefix still contains the `[text]` bracket portion,
  // so it cannot be used directly as the target. splitAtBracket
  // isolates rawTarget (the address only). For mailto we then
  // re-attach the scheme so the target stays `mailto:addr`,
  // which the printer needs to reproduce the original form.
  const [rawTarget, text] = splitAtBracket(afterPrefix);
  const target = isMailto ? `mailto:${rawTarget}` : rawTarget;
  return {
    type: "link",
    form: "macro",
    target,
    text: text === undefined || text.length === EMPTY ? undefined : text,
    position: positionOf(token),
  };
}

/**
 * Build an XrefNode from the `<<target>>` shorthand.
 *
 * Strips the `<<`/`>>` delimiters, then splits at the
 * first comma to separate target from optional display
 * text. The form is `"shorthand"` so the printer can
 * reproduce the angle-bracket syntax.
 * @param token - XrefShorthand token (image wrapped in
 *   `<<` and `>>`)
 * @returns XrefNode with form `"shorthand"`
 */
export function makeXrefFromShorthand(token: IToken): XrefNode {
  // Strip the `<<` prefix and `>>` suffix.
  const inner = token.image.slice(BRACKET_PAIR_LEN, -BRACKET_PAIR_LEN);
  const commaIndex = inner.indexOf(",");
  if (commaIndex === NOT_FOUND) {
    return {
      type: "xref",
      form: "shorthand",
      target: inner,
      text: undefined,
      position: positionOf(token),
    };
  }
  return {
    type: "xref",
    form: "shorthand",
    target: inner.slice(EMPTY, commaIndex),
    text: inner.slice(commaIndex + NEXT),
    position: positionOf(token),
  };
}

/**
 * Build an XrefNode from the `xref:target[text]` macro.
 *
 * Strips the `xref:` prefix and splits at `[` for the
 * optional display text. The form is `"macro"` so the
 * printer reproduces the macro syntax rather than the
 * `<<>>` shorthand.
 * @param token - XrefMacro token from the lexer
 * @returns XrefNode with form `"macro"`
 */
export function makeXrefFromMacro(token: IToken): XrefNode {
  const afterPrefix = token.image.slice("xref:".length);
  const [target, text] = splitAtBracket(afterPrefix);
  return {
    type: "xref",
    form: "macro",
    target,
    text: text === undefined || text.length === EMPTY ? undefined : text,
    position: positionOf(token),
  };
}

/**
 * Build an InlineAnchorNode from a `[[id]]` token.
 *
 * Strips the `[[`/`]]` delimiters and splits at the
 * first comma to separate the anchor ID from optional
 * reftext (the default cross-reference display text).
 * Leading whitespace after the comma is trimmed to match
 * the `[[id, reftext]]` convention.
 * @param token - InlineAnchor token (image wrapped in
 *   `[[` and `]]`)
 * @returns InlineAnchorNode with id and optional reftext
 */
export function makeInlineAnchor(token: IToken): InlineAnchorNode {
  // Strip the `[[` prefix and `]]` suffix.
  const inner = token.image.slice(BRACKET_PAIR_LEN, -BRACKET_PAIR_LEN);
  const commaIndex = inner.indexOf(",");
  if (commaIndex === NOT_FOUND) {
    return {
      type: "inlineAnchor",
      id: inner,
      reftext: undefined,
      position: positionOf(token),
    };
  }
  const reftext = inner.slice(commaIndex + NEXT).trimStart();
  return {
    type: "inlineAnchor",
    id: inner.slice(EMPTY, commaIndex),
    reftext: reftext.length > EMPTY ? reftext : undefined,
    position: positionOf(token),
  };
}
