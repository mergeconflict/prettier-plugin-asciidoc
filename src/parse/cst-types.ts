/**
 * CST node child interfaces for the AsciiDoc parser.
 *
 * Chevrotain's CST nodes have optional arrays for each
 * token/subrule consumed. We type them here for safe access
 * in visitors.
 *
 * Extracted from ast-builder.ts to keep that file within the
 * max-lines lint limit.
 */
import type { CstNode, IToken } from "chevrotain";

export interface DocumentCstChildren {
  block?: CstNode[];
  BlankLine?: IToken[];
  Newline?: IToken[];
}

export interface BlockCstChildren {
  paragraph?: CstNode[];
  SectionMarker?: IToken[];
  DocumentTitle?: IToken[];
  LineComment?: IToken[];
  BlockAnchor?: IToken[];
  BlockAttributeList?: IToken[];
  BlockTitle?: IToken[];
  ThematicBreak?: IToken[];
  PageBreak?: IToken[];
  blockComment?: CstNode[];
  attributeEntry?: CstNode[];
  unorderedList?: CstNode[];
  orderedList?: CstNode[];
  calloutList?: CstNode[];
  listingBlock?: CstNode[];
  literalBlock?: CstNode[];
  passBlock?: CstNode[];
  exampleBlock?: CstNode[];
  sidebarBlock?: CstNode[];
  openBlock?: CstNode[];
  quoteBlock?: CstNode[];
  literalParagraph?: CstNode[];
  admonitionParagraph?: CstNode[];
}

export interface ParagraphCstChildren {
  TextContent?: IToken[];
  Newline?: IToken[];
}

export interface UnorderedListCstChildren {
  listItem?: CstNode[];
}

export interface ListItemCstChildren {
  UnorderedListMarker?: IToken[];
  TextContent?: IToken[];
  IndentedLine?: IToken[];
  Newline?: IToken[];
}

export interface OrderedListCstChildren {
  orderedListItem?: CstNode[];
}

export interface OrderedListItemCstChildren {
  OrderedListMarker?: IToken[];
  TextContent?: IToken[];
  IndentedLine?: IToken[];
  Newline?: IToken[];
}

export interface CalloutListCstChildren {
  calloutListItem?: CstNode[];
}

export interface CalloutListItemCstChildren {
  CalloutListMarker?: IToken[];
  TextContent?: IToken[];
  IndentedLine?: IToken[];
  Newline?: IToken[];
}

export interface BlockCommentCstChildren {
  BlockCommentDelimiter?: IToken[];
  BlockCommentEnd?: IToken[];
  BlockCommentContent?: IToken[];
  Newline?: IToken[];
  BlankLine?: IToken[];
}

// CST children for delimited leaf blocks. Each has an open
// token, a close token, and optional verbatim content between
// them.

export interface ListingBlockCstChildren {
  ListingBlockOpen?: IToken[];
  ListingBlockClose?: IToken[];
  VerbatimContent?: IToken[];
  Newline?: IToken[];
  BlankLine?: IToken[];
}

export interface LiteralBlockCstChildren {
  LiteralBlockOpen?: IToken[];
  LiteralBlockClose?: IToken[];
  VerbatimContent?: IToken[];
  Newline?: IToken[];
  BlankLine?: IToken[];
}

export interface PassBlockCstChildren {
  PassBlockOpen?: IToken[];
  PassBlockClose?: IToken[];
  VerbatimContent?: IToken[];
  Newline?: IToken[];
  BlankLine?: IToken[];
}

// CST children for delimited parent blocks. Each has delimiter
// tokens and recursive block subrules for their content.

export interface ExampleBlockCstChildren {
  ExampleBlockDelimiter?: IToken[];
  block?: CstNode[];
  Newline?: IToken[];
  BlankLine?: IToken[];
}

export interface SidebarBlockCstChildren {
  SidebarBlockDelimiter?: IToken[];
  block?: CstNode[];
  Newline?: IToken[];
  BlankLine?: IToken[];
}

export interface OpenBlockCstChildren {
  OpenBlockDelimiter?: IToken[];
  block?: CstNode[];
  Newline?: IToken[];
  BlankLine?: IToken[];
}

export interface QuoteBlockCstChildren {
  QuoteBlockDelimiter?: IToken[];
  block?: CstNode[];
  Newline?: IToken[];
  BlankLine?: IToken[];
}

export interface LiteralParagraphCstChildren {
  IndentedLine?: IToken[];
  Newline?: IToken[];
}

export interface AdmonitionParagraphCstChildren {
  AdmonitionMarker?: IToken[];
  TextContent?: IToken[];
  Newline?: IToken[];
}

export interface AttributeEntryCstChildren {
  AttributeEntry?: IToken[];
  Newline?: IToken[];
}
