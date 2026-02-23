/* eslint-disable require-unicode-regexp -- Chevrotain's regexp-to-ast does not support the v flag */

/**
 * Inline macro tokens for the Chevrotain lexer.
 *
 * Extracted from tokens.ts to keep that file within the
 * max-lines lint limit. Defines tokens for inline image,
 * keyboard, button, menu, footnote, and pass macros, plus
 * the hard line break token.
 */
import { createToken } from "chevrotain";

/**
 * Hard line break: ` +` at end of a line. A space followed by
 * `+` immediately before a newline forces a line break in
 * output. Uses a lookahead for `\n` rather than consuming it —
 * the newline is left for InlineNewline to handle (including
 * its mode pop back to default_mode). Must appear before
 * InlineNewline in the inline mode token list.
 */
export const HardLineBreak = createToken({
  name: "HardLineBreak",
  pattern: / \+(?=\n)/,
  start_chars_hint: [" "],
});

// ── Inline macro tokens ─────────────────────────────────────

/** Inline image: `image:target[alt]`. */
export const InlineImage = createToken({
  name: "InlineImage",
  pattern: /image:[^\s[]+\[[^\]]*\]/,
  start_chars_hint: ["i"],
});
/** Keyboard macro: `kbd:[keys]`. */
export const KbdMacro = createToken({
  name: "KbdMacro",
  pattern: /kbd:\[[^\]]*\]/,
  start_chars_hint: ["k"],
});
/** Button macro: `btn:[label]`. */
export const ButtonMacro = createToken({
  name: "ButtonMacro",
  pattern: /btn:\[[^\]]*\]/,
  start_chars_hint: ["b"],
});
/** Menu macro: `menu:path[item]`. */
export const MenuMacro = createToken({
  name: "MenuMacro",
  pattern: /menu:[^\s[]+\[[^\]]*\]/,
  start_chars_hint: ["m"],
});
/** Footnote macro: `footnote:[text]`. */
export const FootnoteMacro = createToken({
  name: "FootnoteMacro",
  pattern: /footnote:\[[^\]]*\]/,
  start_chars_hint: ["f"],
});
/** Footnoteref macro: `footnoteref:[...]`. */
export const FootnoteReferenceMacro = createToken({
  name: "FootnoteReferenceMacro",
  pattern: /footnoteref:\[[^\]]*\]/,
  start_chars_hint: ["f"],
});
/** Pass macro: `pass:[content]`. */
export const PassMacro = createToken({
  name: "PassMacro",
  pattern: /pass:\[[^\]]*\]/,
  start_chars_hint: ["p"],
});
