// Single-token to AST node builders.
//
// These functions convert individual lexer tokens into typed AST
// nodes. Extracted from ast-builder.ts to keep that file within
// the max-lines lint limit.
import type { IToken } from "chevrotain";
import type {
  SectionNode,
  DocumentTitleNode,
  CommentNode,
  BlockAttributeListNode,
  BlockAnchorNode,
  BlockTitleNode,
  ThematicBreakNode,
  PageBreakNode,
  BlockNode,
} from "../ast.js";
import { FIRST, MARKER_OFFSET } from "../constants.js";
import type { BlockCstChildren } from "./cst-types.js";
import {
  tokenStartLocation,
  tokenEndLocation,
} from "./positions.js";

const SECTION_MARKER_RE =
  /^(?<markers>={2,6})\s+(?<title>.*)/v;

// The lexer captures the entire heading line as one token
// (e.g. "== My Title"). We need to split it here because
// the AST stores level and title separately — the printer
// needs them independently to reconstruct the heading with
// normalized whitespace.
function buildSection(token: IToken): SectionNode {
  const match = SECTION_MARKER_RE.exec(token.image);
  if (match?.groups === undefined) {
    throw new Error(
      `Invalid section marker: ${token.image}`,
    );
  }
  return {
    type: "section",
    level: match.groups.markers.length - MARKER_OFFSET,
    heading: match.groups.title.trim(),
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

// Builds a DocumentTitleNode from the lexer token. Like
// buildSection, the lexer captures the entire line as one
// token and we extract the title text here so the printer
// can normalize whitespace.
function buildDocumentTitle(
  token: IToken,
): DocumentTitleNode {
  const title = token.image
    .slice(DOCUMENT_TITLE_PREFIX_LEN)
    .trim();
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

function buildLineComment(token: IToken): CommentNode {
  // Strip the leading "//" to get " text" or "".
  const raw = token.image.slice(LINE_COMMENT_PREFIX_LEN);
  // If the comment has content, it starts with a space —
  // strip it.
  const value = raw.startsWith(" ")
    ? raw.slice(LINE_COMMENT_SPACE_LEN)
    : raw;

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

// Checks whether the block CST contains a single-token block
// type (section heading or line comment) and builds the
// corresponding AST node directly. Returns undefined if the
// block is a subrule type.

// Block anchor token is `[[id]]` or `[[id,reftext]]`. The double
// brackets and their content are the full token image. We strip
// the outer `[[` and `]]` to get the id content.
const BLOCK_ANCHOR_PREFIX_LEN = 2;
const BLOCK_ANCHOR_SUFFIX_LEN = 2;

// Return value of String.indexOf when no match is found.
const NOT_FOUND = -1;

// Offset to skip past a single-character separator (the comma).
const AFTER_SEPARATOR = 1;

function buildBlockAnchor(token: IToken): BlockAnchorNode {
  const raw = token.image.slice(
    BLOCK_ANCHOR_PREFIX_LEN,
    -BLOCK_ANCHOR_SUFFIX_LEN,
  );
  const commaIndex = raw.indexOf(",");
  const id = commaIndex === NOT_FOUND ? raw : raw.slice(FIRST, commaIndex);
  const reftext =
    commaIndex === NOT_FOUND
      ? undefined
      : raw.slice(commaIndex + AFTER_SEPARATOR).trimStart();
  return {
    type: "blockAnchor",
    id,
    reftext,
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

function buildBlockAttributeList(
  token: IToken,
): BlockAttributeListNode {
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
// syntactic — we strip it to get the title text.
const BLOCK_TITLE_PREFIX_LEN = 1;

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

// Thematic break: `'''` — position only, no content.
function buildThematicBreak(token: IToken): ThematicBreakNode {
  return {
    type: "thematicBreak",
    position: {
      start: tokenStartLocation(token),
      end: tokenEndLocation(token),
    },
  };
}

// Page break: `<<<` — position only, no content.
function buildPageBreak(token: IToken): PageBreakNode {
  return {
    type: "pageBreak",
    position: {
      start: tokenStartLocation(token),
      end: tokenEndLocation(token),
    },
  };
}

// Tries to extract a token from the CST and build an AST node.
// Returns undefined if the token array is absent or empty.
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

// Checks whether the block CST contains a single-token block
// type and builds the corresponding AST node directly. Returns
// undefined if the block is a subrule type that requires a
// visitor method.
export function buildTokenBlock(
  context: BlockCstChildren,
): BlockNode | undefined {
  return (
    tryBuild(context.SectionMarker, buildSection) ??
    tryBuild(context.DocumentTitle, buildDocumentTitle) ??
    tryBuild(context.LineComment, buildLineComment) ??
    tryBuild(context.BlockAnchor, buildBlockAnchor) ??
    tryBuild(context.BlockAttributeList, buildBlockAttributeList) ??
    tryBuild(context.BlockTitle, buildBlockTitle) ??
    tryBuild(context.ThematicBreak, buildThematicBreak) ??
    tryBuild(context.PageBreak, buildPageBreak)
  );
}
