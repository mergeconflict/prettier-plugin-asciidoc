/**
 * Factory functions for building inline macro, passthrough,
 * and hard line break AST nodes from their lexer tokens.
 *
 * Follows the same pattern as inline-link-builder.ts — simple
 * string splitting instead of regex for parsing token images.
 */
import type { IToken } from "chevrotain";
import type {
  InlineImageNode,
  KbdNode,
  ButtonNode,
  MenuNode,
  FootnoteNode,
  PassthroughNode,
  HardLineBreakNode,
} from "../ast.js";
import { EMPTY, NEXT } from "../constants.js";
import { tokenStartLocation, tokenEndLocation } from "./positions.js";

// Sentinel for indexOf when no match is found.
const NOT_FOUND = -1;

// ── String splitting helpers ────────────────────────────────

/**
 * Split a string at the first `[` to separate the
 * macro prefix/target from the bracket-enclosed content.
 *
 * Unlike the variant in inline-link-builder, this always
 * returns a string for the inside portion (empty string
 * if no bracket is found) because macro builders always
 * expect content between brackets.
 * @param image - String to split: either the full token
 *   image or a prefix-stripped substring (e.g.
 *   `"logo.png[Logo]"` after stripping `"image:"`)
 * @returns Tuple of [beforeBracket, insideBracket] with
 *   the enclosing `[` and `]` stripped from insideBracket
 */
function splitAtBracket(image: string): [string, string] {
  const bracketIndex = image.indexOf("[");
  if (bracketIndex === NOT_FOUND) {
    return [image, ""];
  }
  const before = image.slice(EMPTY, bracketIndex);
  // Strip the opening `[` and the closing `]` (assumed last char).
  const inside = image.slice(bracketIndex + NEXT, -NEXT);
  return [before, inside];
}

/**
 * Extract start/end source positions from a Chevrotain
 * token for AST location tracking.
 * @param token - Chevrotain token with offset/line/col
 * @returns Object with `start` and `end` locations
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
 * Build an InlineImageNode from an `image:` macro token.
 *
 * Strips the `image:` prefix and splits at `[` to
 * extract the target path and optional alt text. An
 * empty alt attribute is normalized to undefined so the
 * printer can omit it.
 * @param token - InlineImage token from the lexer
 * @returns InlineImageNode with target and optional alt
 */
export function makeInlineImage(token: IToken): InlineImageNode {
  const afterPrefix = token.image.slice("image:".length);
  const [target, alt] = splitAtBracket(afterPrefix);
  return {
    type: "inlineImage",
    target,
    alt: alt.length === EMPTY ? undefined : alt,
    position: positionOf(token),
  };
}

/**
 * Build a KbdNode from a `kbd:` macro token.
 *
 * Extracts the key sequence string from inside the
 * brackets. The keys string is preserved verbatim
 * (e.g. `"Ctrl+C"`) — no further parsing into
 * individual keys is done at this stage.
 * @param token - KbdMacro token from the lexer
 * @returns KbdNode with the raw keys string
 */
export function makeKbd(token: IToken): KbdNode {
  const [, keys] = splitAtBracket(token.image);
  return {
    type: "kbd",
    keys,
    position: positionOf(token),
  };
}

/**
 * Build a ButtonNode from a `btn:` macro token.
 *
 * Extracts the button label from inside the brackets.
 * The label is preserved verbatim for round-trip
 * formatting.
 * @param token - ButtonMacro token from the lexer
 * @returns ButtonNode with the label string
 */
export function makeButton(token: IToken): ButtonNode {
  const [, label] = splitAtBracket(token.image);
  return {
    type: "btn",
    label,
    position: positionOf(token),
  };
}

/**
 * Build a MenuNode from a `menu:` macro token.
 *
 * Strips the `menu:` prefix to get the menu path (the
 * top-level menu and any submenus), then extracts the
 * final menu item from inside the brackets.
 * @param token - MenuMacro token from the lexer
 * @returns MenuNode with path and item strings
 */
export function makeMenu(token: IToken): MenuNode {
  const afterPrefix = token.image.slice("menu:".length);
  const [path, item] = splitAtBracket(afterPrefix);
  return {
    type: "menu",
    path,
    item,
    position: positionOf(token),
  };
}

/**
 * Build a FootnoteNode from a `footnote:` macro token.
 *
 * Extracts the footnote text from inside the brackets.
 * This produces an anonymous footnote (no id), which
 * is distinct from the named `footnoteref:` form.
 * @param token - FootnoteMacro token from the lexer
 * @returns FootnoteNode with text and undefined id
 */
export function makeFootnote(token: IToken): FootnoteNode {
  const [, text] = splitAtBracket(token.image);
  return {
    type: "footnote",
    text,
    id: undefined,
    position: positionOf(token),
  };
}

/**
 * Build a FootnoteNode from a `footnoteref:` macro token.
 *
 * Handles both forms: `footnoteref:[id,text]` creates a
 * named footnote definition, while `footnoteref:[id]`
 * creates a back-reference to an existing named footnote.
 * The two forms are distinguished by whether a comma
 * appears in the bracket content.
 * @param token - FootnoteReferenceMacro token from the
 *   lexer
 * @returns FootnoteNode with id set; text is an empty
 *   string for back-references because FootnoteNode.text
 *   is non-optional in the AST
 */
export function makeFootnoteReference(token: IToken): FootnoteNode {
  const [, inner] = splitAtBracket(token.image);
  const commaIndex = inner.indexOf(",");
  if (commaIndex === NOT_FOUND) {
    // Reference form: footnoteref:[id]
    return {
      type: "footnote",
      text: "",
      id: inner,
      position: positionOf(token),
    };
  }
  // Definition form: footnoteref:[id,text]
  const id = inner.slice(EMPTY, commaIndex);
  const text = inner.slice(commaIndex + NEXT);
  return {
    type: "footnote",
    text,
    id,
    position: positionOf(token),
  };
}

/**
 * Build a PassthroughNode from a `pass:` macro token.
 *
 * Extracts the passthrough content from inside the
 * brackets. This content bypasses normal inline
 * substitutions and is preserved verbatim in output.
 * @param token - PassMacro token from the lexer
 * @returns PassthroughNode with raw content string
 */
export function makePassMacro(token: IToken): PassthroughNode {
  const [, content] = splitAtBracket(token.image);
  return {
    type: "passthrough",
    content,
    position: positionOf(token),
  };
}

/**
 * Build a HardLineBreakNode from a ` +` line-ending token.
 *
 * Hard line breaks force a line break in output. They
 * are represented as standalone AST nodes (rather than
 * embedded in text) so the printer can emit the correct
 * Prettier Doc IR for line-break semantics.
 * @param token - HardLineBreak token from the lexer
 * @returns HardLineBreakNode with source position only
 */
export function makeHardLineBreak(token: IToken): HardLineBreakNode {
  return {
    type: "hardLineBreak",
    position: positionOf(token),
  };
}
