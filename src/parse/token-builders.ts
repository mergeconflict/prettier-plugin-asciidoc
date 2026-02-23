// Single-token to AST node builders.
//
// These functions convert individual lexer tokens into typed AST
// nodes. Every builder here takes exactly one IToken and returns
// one BlockNode — no CST recursion is needed. They are separated
// from ast-builder.ts both to keep that file within the max-lines
// lint limit and to make the single-token / subrule distinction
// explicit at the module boundary.
import type { IToken } from "chevrotain";
import type {
  SectionNode,
  DocumentTitleNode,
  CommentNode,
  BlockAttributeListNode,
  BlockTitleNode,
  ThematicBreakNode,
  PageBreakNode,
  BlockNode,
} from "../ast.js";
import { FIRST, MARKER_OFFSET } from "../constants.js";
import { unreachable } from "../unreachable.js";
import type { BlockCstChildren } from "./cst-types.js";
import { tokenStartLocation, tokenEndLocation } from "./positions.js";

const SECTION_MARKER_RE = /^(?<markers>={2,6})\s+(?<title>.*)/v;

/**
 * Builds a SectionNode from a heading-line token.
 *
 * The lexer captures the entire heading line as one
 * token (e.g. "== My Title"). We split it here because
 * the AST stores level and title separately -- the
 * printer needs them independently to reconstruct the
 * heading with normalized whitespace.
 * @param token - A SectionMarker token containing
 *   the full heading line.
 * @returns A section node with level, heading text,
 *   and an empty children array for the visitor to
 *   populate as it recurses into the section body.
 */
function buildSection(token: IToken): SectionNode {
  // The lexer's SectionMarker pattern guarantees this regex
  // matches — if it doesn't, the token definition is wrong.
  const match = SECTION_MARKER_RE.exec(token.image);
  const groups =
    match?.groups ?? unreachable(`Invalid section marker: ${token.image}`);
  return {
    type: "section",
    level: groups.markers.length - MARKER_OFFSET,
    heading: groups.title.trim(),
    children: [],
    position: {
      start: tokenStartLocation(token),
      end: tokenEndLocation(token),
    },
  };
}

// The document title token is `= Title Text`. The prefix `= `
// is always exactly 2 characters (the `=` sign and a space).
const DOCUMENT_TITLE_PREFIX_LEN = 2;

/**
 * Builds a DocumentTitleNode from a document-title token.
 *
 * Like buildSection, the lexer captures the full line
 * as one token. We extract the title text here so the
 * printer can normalize whitespace independently of
 * the `= ` prefix.
 * @param token - A DocumentTitle token whose image
 *   starts with `= `.
 * @returns A document title node with the extracted
 *   title text.
 */
function buildDocumentTitle(token: IToken): DocumentTitleNode {
  const title = token.image.slice(DOCUMENT_TITLE_PREFIX_LEN).trim();
  return {
    type: "documentTitle",
    title,
    position: {
      start: tokenStartLocation(token),
      end: tokenEndLocation(token),
    },
  };
}

// The lexer captures "// text" as a single LineComment token.
// We strip the leading "// " (or just "//") to get the comment
// text. The space after // is syntactic, not content.
// Prefix "//" is 2 characters; the space separator is 1 more.
const LINE_COMMENT_PREFIX_LEN = 2;
const LINE_COMMENT_SPACE_LEN = 1;

/**
 * Builds a CommentNode from a line-comment token.
 *
 * Strips the syntactic `//` prefix and the optional
 * space separator to extract just the comment text.
 * An empty comment (`//` with nothing after) yields
 * an empty string value.
 * @param token - A LineComment token whose image
 *   starts with `//`.
 * @returns A comment node with commentType "line" and
 *   the extracted text content.
 */
function buildLineComment(token: IToken): CommentNode {
  // Strip the leading "//" to get " text" or "".
  const raw = token.image.slice(LINE_COMMENT_PREFIX_LEN);
  // If the comment has content, it starts with a space —
  // strip it.
  const value = raw.startsWith(" ") ? raw.slice(LINE_COMMENT_SPACE_LEN) : raw;

  return {
    type: "comment",
    commentType: "line",
    value,
    position: {
      start: tokenStartLocation(token),
      end: tokenEndLocation(token),
    },
  };
}

// Block attribute list token is `[content]`. We strip the outer
// brackets to get the raw attribute content.
const BLOCK_ATTR_LIST_PREFIX_LEN = 1;
const BLOCK_ATTR_LIST_SUFFIX_LEN = 1;

/**
 * Builds a BlockAttributeListNode from a block
 * attribute list token.
 *
 * The token image is `[content]`. We strip the outer
 * brackets so the AST stores only the raw attribute
 * text -- the printer re-wraps it in brackets when
 * emitting output.
 * @param token - A BlockAttributeList token whose
 *   image is bracket-delimited.
 * @returns A block attribute list node with the
 *   inner content as its value.
 */
function buildBlockAttributeList(token: IToken): BlockAttributeListNode {
  const value = token.image.slice(
    BLOCK_ATTR_LIST_PREFIX_LEN,
    -BLOCK_ATTR_LIST_SUFFIX_LEN,
  );
  return {
    type: "blockAttributeList",
    value,
    position: {
      start: tokenStartLocation(token),
      end: tokenEndLocation(token),
    },
  };
}

// Block title token is `.Title text`. The leading dot is
// syntactic — we strip it to get the title text. The lexer
// pattern (/\.(?![. ])\S[^\n]*/) guarantees the character
// immediately after the dot is non-whitespace, so no trim() is
// needed here (unlike buildSection / buildDocumentTitle, where
// the spec allows arbitrary whitespace between the marker and
// the title text).
const BLOCK_TITLE_PREFIX_LEN = 1;

/**
 * Builds a BlockTitleNode from a block-title token.
 *
 * The token image is `.Title text`. The leading dot is
 * syntactic, so we strip it -- the printer re-adds the
 * dot prefix during output.
 * @param token - A BlockTitle token whose image starts
 *   with a `.` prefix.
 * @returns A block title node with the extracted title
 *   text.
 */
function buildBlockTitle(token: IToken): BlockTitleNode {
  const title = token.image.slice(BLOCK_TITLE_PREFIX_LEN);
  return {
    type: "blockTitle",
    title,
    position: {
      start: tokenStartLocation(token),
      end: tokenEndLocation(token),
    },
  };
}

/**
 * Builds a ThematicBreakNode from a thematic-break token.
 *
 * Thematic breaks (`'''`) carry no content -- only
 * source position is preserved so the printer can
 * place the delimiter correctly.
 * @param token - A ThematicBreak token.
 * @returns A thematic break node with source position.
 */
function buildThematicBreak(token: IToken): ThematicBreakNode {
  return {
    type: "thematicBreak",
    position: {
      start: tokenStartLocation(token),
      end: tokenEndLocation(token),
    },
  };
}

/**
 * Builds a PageBreakNode from a page-break token.
 *
 * Page breaks (`<<<`) carry no content -- only source
 * position is preserved so the printer can place the
 * delimiter correctly.
 * @param token - A PageBreak token.
 * @returns A page break node with source position.
 */
function buildPageBreak(token: IToken): PageBreakNode {
  return {
    type: "pageBreak",
    position: {
      start: tokenStartLocation(token),
      end: tokenEndLocation(token),
    },
  };
}

/**
 * Extracts the first token from a CST token array and
 * converts it to an AST node using the given builder.
 *
 * CST children are optional arrays -- a rule's token
 * slot is undefined when the alternative wasn't matched.
 * This helper centralizes the presence check so each
 * call site in buildTokenBlock stays concise.
 * @param tokens - The CST token array, which may be
 *   undefined or empty if the alternative wasn't matched.
 * @param build - Builder function that converts a single
 *   token into the corresponding block-level AST node.
 *   All callers are the single-token block builders
 *   defined in this module.
 * @returns The built AST node, or undefined if no token
 *   was present.
 */
function tryBuild(
  tokens: IToken[] | undefined,
  build: (token: IToken) => BlockNode,
): BlockNode | undefined {
  const token = tokens?.[FIRST];
  if (token !== undefined) {
    return build(token);
  }
  return undefined;
}

/**
 * Dispatches a block CST node to the appropriate
 * single-token AST builder.
 *
 * Some block types (sections, comments, titles, breaks,
 * attribute lists) are fully represented by a single
 * lexer token and need no visitor traversal. This
 * function checks each token slot in priority order and
 * builds the AST node directly. Returns undefined for
 * subrule-based blocks (paragraphs, delimited blocks)
 * that require the visitor to recurse.
 * @param context - The CST children of a block rule,
 *   containing optional token arrays for each
 *   alternative.
 * @returns The AST node for a single-token block, or
 *   undefined if the block requires visitor traversal.
 */
export function buildTokenBlock(
  context: BlockCstChildren,
): BlockNode | undefined {
  return (
    tryBuild(context.SectionMarker, buildSection) ??
    tryBuild(context.DocumentTitle, buildDocumentTitle) ??
    tryBuild(context.LineComment, buildLineComment) ??
    tryBuild(context.BlockAttributeList, buildBlockAttributeList) ??
    tryBuild(context.BlockTitle, buildBlockTitle) ??
    tryBuild(context.ThematicBreak, buildThematicBreak) ??
    tryBuild(context.PageBreak, buildPageBreak)
  );
}
