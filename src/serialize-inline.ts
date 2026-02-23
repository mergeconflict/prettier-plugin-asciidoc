/**
 * Serializes inline macro AST nodes back to their AsciiDoc
 * source representation. Covers links, xrefs, inline
 * anchors, images, kbd, button, menu, footnotes, and
 * passthroughs. Shared by the printer, paragraph-form
 * transformer, and TCK converter.
 */
import type {
  ButtonNode,
  FootnoteNode,
  InlineAnchorNode,
  InlineImageNode,
  KbdNode,
  LinkNode,
  MenuNode,
  PassthroughNode,
  XrefNode,
} from "./ast.js";
import { EMPTY } from "./constants.js";

/**
 * Serialize a link AST node back to AsciiDoc source.
 * Handles bare URLs, `link:` macros, and `mailto:` links,
 * preserving the author's original syntax form so
 * round-trip formatting is lossless.
 * @param node - The parsed link with target, optional
 *   display text, and form (`"url"` for auto-detected bare
 *   URLs, `"macro"` for explicit `link:` and `mailto:`
 *   syntax). The form determines whether a `link:` prefix
 *   is emitted.
 * @returns AsciiDoc source string for the link.
 */
export function linkToSource(node: LinkNode): string {
  if (node.form === "url") {
    return node.text === undefined
      ? node.target
      : `${node.target}[${node.text}]`;
  }
  // Macro form: link:target[text] or mailto:addr[text].
  // For mailto targets, the `mailto:` prefix is part of
  // the target string, so we emit it directly.
  const isMailto = node.target.startsWith("mailto:");
  if (isMailto) {
    return node.text === undefined
      ? `${node.target}[]`
      : `${node.target}[${node.text}]`;
  }
  return node.text === undefined
    ? `link:${node.target}[]`
    : `link:${node.target}[${node.text}]`;
}

/**
 * Serialize a cross-reference AST node back to AsciiDoc
 * source. Emits shorthand (`<<target>>`) or macro
 * (`xref:target[]`) form based on how it was originally
 * written, ensuring round-trip fidelity.
 * @param node - The parsed xref with target, optional
 *   display text, and form (`"shorthand"` for `<<target>>`
 *   syntax, `"macro"` for `xref:target[]` syntax).
 * @returns AsciiDoc source string for the xref.
 */
export function xrefToSource(node: XrefNode): string {
  if (node.form === "macro") {
    return node.text === undefined
      ? `xref:${node.target}[]`
      : `xref:${node.target}[${node.text}]`;
  }
  return node.text === undefined
    ? `<<${node.target}>>`
    : `<<${node.target},${node.text}>>`;
}

/**
 * Serialize an inline anchor AST node back to AsciiDoc
 * source. Produces `[[id]]` or `[[id, reftext]]`
 * depending on whether optional reference text is present.
 * @param node - The parsed anchor with an id and
 *   optional reftext used as the default display text
 *   when another section references this anchor.
 * @returns AsciiDoc source string for the anchor.
 */
export function anchorToSource(node: InlineAnchorNode): string {
  return node.reftext === undefined
    ? `[[${node.id}]]`
    : `[[${node.id}, ${node.reftext}]]`;
}

/**
 * Serialize an inline image AST node back to AsciiDoc
 * source. Emits `image:target[]` or `image:target[alt]`
 * without any path normalization, preserving the
 * original target verbatim.
 * @param node - The parsed inline image with a target
 *   path and optional alt text.
 * @returns AsciiDoc source string for the inline image.
 */
export function inlineImageToSource(node: InlineImageNode): string {
  return node.alt === undefined
    ? `image:${node.target}[]`
    : `image:${node.target}[${node.alt}]`;
}

/**
 * Serialize a keyboard shortcut AST node back to
 * AsciiDoc source as `kbd:[keys]`.
 * @param node - The parsed kbd node with a keys string
 *   representing the shortcut sequence.
 * @returns AsciiDoc source string for the kbd macro.
 */
export function kbdToSource(node: KbdNode): string {
  return `kbd:[${node.keys}]`;
}

/**
 * Serialize a UI button AST node back to AsciiDoc
 * source as `btn:[label]`.
 * @param node - The parsed button node with a label
 *   string for the button text.
 * @returns AsciiDoc source string for the btn macro.
 */
export function buttonToSource(node: ButtonNode): string {
  return `btn:[${node.label}]`;
}

/**
 * Serialize a menu selection AST node back to AsciiDoc
 * source as `menu:path[item]`, representing a UI
 * menu navigation sequence.
 * @param node - The parsed menu node with a navigation
 *   path and terminal menu item.
 * @returns AsciiDoc source string for the menu macro.
 */
export function menuToSource(node: MenuNode): string {
  return `menu:${node.path}[${node.item}]`;
}

/**
 * Serialize a footnote AST node back to AsciiDoc source.
 * Distinguishes three forms: anonymous (`footnote:[text]`),
 * named definition (`footnoteref:[id,text]`), and
 * back-reference (`footnoteref:[id]`) based on whether
 * the node carries an id and/or text content.
 * @param node - The parsed footnote. `text` holds the
 *   footnote body for anonymous and named forms; it is
 *   empty string `""` for back-references (the parser
 *   convention used to distinguish a reference from a
 *   definition). `id` is undefined for anonymous
 *   footnotes.
 * @returns AsciiDoc source string for the footnote.
 */
export function footnoteToSource(node: FootnoteNode): string {
  if (node.id === undefined) {
    // No id means anonymous: the text is the full footnote body.
    return `footnote:[${node.text}]`;
  }
  if (node.text.length === EMPTY) {
    // Empty text is the parser's signal for a back-reference:
    // footnoteref:[id] with no body, just the shared id.
    return `footnoteref:[${node.id}]`;
  }
  // Named footnote definition: footnoteref:[id,text]
  return `footnoteref:[${node.id},${node.text}]`;
}

/**
 * Serialize a passthrough AST node back to AsciiDoc
 * source as `pass:[content]`. The content is preserved
 * verbatim — it bypasses inline substitutions in the
 * AsciiDoc processor.
 * @param node - The parsed passthrough node with raw
 *   content that must not be transformed.
 * @returns AsciiDoc source string for the pass macro.
 */
export function passthroughToSource(node: PassthroughNode): string {
  return `pass:[${node.content}]`;
}
