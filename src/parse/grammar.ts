/* eslint-disable unicorn/consistent-function-scoping -- Chevrotain RULE lambdas must be class property initializers */

/**
 * Chevrotain CST parser for AsciiDoc.
 *
 * The grammar is intentionally flat: sections are parsed as individual block
 * tokens, not as nested rules. This avoids the complexity of recursive section
 * nesting at parse time. The AST builder handles grouping child blocks under
 * their heading after the CST is built.
 *
 * `performSelfAnalysis()` runs once per class instantiation to build lookahead
 * tables. We create a single parser instance and reuse it by setting `.input`
 * before each parse.
 */
import { CstParser } from "chevrotain";
import type { CstNode, ParserMethod, TokenType } from "chevrotain";
import {
  allTokens,
  AttributeEntry,
  BlankLine,
  BlockCommentContent,
  BlockCommentDelimiter,
  BlockCommentEnd,
  DocumentTitle,
  ExampleBlockClose,
  ExampleBlockOpen,
  LineComment,
  ThematicBreak,
  PageBreak,
  FencedCodeClose,
  FencedCodeOpen,
  ListingBlockClose,
  ListingBlockOpen,
  LiteralBlockClose,
  LiteralBlockOpen,
  Newline,
  OpenBlockDelimiter,
  PassBlockClose,
  PassBlockOpen,
  QuoteBlockClose,
  QuoteBlockOpen,
  SectionMarker,
  SidebarBlockClose,
  SidebarBlockOpen,
  IndentedLine,
  TextContent,
  UnorderedListMarker,
  OrderedListMarker,
  CalloutListMarker,
  VerbatimContent,
  BlockAnchor,
  BlockAttributeList,
  BlockTitle,
  AdmonitionMarker,
} from "./tokens.js";
import { LOOKAHEAD } from "../constants.js";

/**
 * A single instance is created and reused — set `.input`
 * before each parse to reset state. performSelfAnalysis()
 * builds lookahead tables from the grammar rules; it must
 * run exactly once per class (not per parse call).
 */
export class AsciidocParser extends CstParser {
  constructor() {
    // recoveryEnabled activates Chevrotain's four built-in
    // recovery strategies (token insertion, deletion,
    // repetition re-sync, general re-sync). This lets the
    // parser produce a partial CST even when rules fail —
    // e.g. an unclosed delimited block missing its end
    // delimiter. Without this, such inputs would throw a
    // parse error, crashing the formatter instead of
    // degrading gracefully.
    super(allTokens, { recoveryEnabled: true });
    this.performSelfAnalysis();
  }

  /**
   * Top-level rule: sequence of blocks separated by blank
   * lines. The Newline alternative handles edge cases like a
   * lone \n at the start of input (not enough for BlankLine,
   * which requires \n...\n).
   */
  document = this.RULE("document", () => {
    this.MANY(() => {
      this.OR([
        { ALT: () => this.CONSUME(BlankLine) },
        { ALT: () => this.CONSUME(Newline) },
        { ALT: () => this.SUBRULE(this.block) },
      ]);
    });
  });

  /**
   * A block-level element: section heading, comment, attribute
   * entry, list, or paragraph. Attribute entry must precede
   * paragraph because an attribute line like `:toc:` would also
   * match TextContent. Unordered list must precede paragraph
   * because `* text` would also match TextContent.
   */
  block = this.RULE("block", () => {
    this.OR([
      { ALT: () => this.CONSUME(SectionMarker) },
      { ALT: () => this.CONSUME(DocumentTitle) },
      { ALT: () => this.CONSUME(LineComment) },
      { ALT: () => this.CONSUME(BlockAnchor) },
      { ALT: () => this.CONSUME(BlockAttributeList) },
      { ALT: () => this.CONSUME(BlockTitle) },
      { ALT: () => this.CONSUME(ThematicBreak) },
      { ALT: () => this.CONSUME(PageBreak) },
      { ALT: () => this.SUBRULE(this.blockComment) },
      { ALT: () => this.SUBRULE(this.attributeEntry) },
      { ALT: () => this.SUBRULE(this.unorderedList) },
      { ALT: () => this.SUBRULE(this.orderedList) },
      { ALT: () => this.SUBRULE(this.calloutList) },
      { ALT: () => this.SUBRULE(this.listingBlock) },
      { ALT: () => this.SUBRULE(this.fencedCodeBlock) },
      { ALT: () => this.SUBRULE(this.literalBlock) },
      { ALT: () => this.SUBRULE(this.passBlock) },
      { ALT: () => this.SUBRULE(this.exampleBlock) },
      { ALT: () => this.SUBRULE(this.sidebarBlock) },
      { ALT: () => this.SUBRULE(this.openBlock) },
      { ALT: () => this.SUBRULE(this.quoteBlock) },
      { ALT: () => this.SUBRULE(this.literalParagraph) },
      { ALT: () => this.SUBRULE(this.admonitionParagraph) },
      { ALT: () => this.SUBRULE(this.paragraph) },
    ]);
  });

  /**
   * Block comment: opening delimiter, optional content lines,
   * closing delimiter. The lexer handles mode switching —
   * BlockCommentDelimiter pushes into block_comment mode, and
   * BlockCommentEnd pops back. Content between delimiters can
   * be any mix of text and blank lines.
   */
  blockComment = this.RULE("blockComment", () => {
    this.CONSUME(BlockCommentDelimiter);
    this.MANY(() => {
      this.OR2([
        { ALT: () => this.CONSUME(BlockCommentContent) },
        { ALT: () => this.CONSUME(Newline) },
        { ALT: () => this.CONSUME(BlankLine) },
      ]);
    });
    this.CONSUME(BlockCommentEnd);
    // Consume optional trailing newline after closing delimiter.
    this.OPTION(() => {
      this.CONSUME2(Newline);
    });
  });

  // Factory for leaf block rules. Listing, literal, and pass
  // blocks share identical grammar: open delimiter, verbatim
  // content (no inline parsing), close delimiter. The lexer
  // handles mode-switching for each block type.
  private leafBlockRule(
    name: string,
    openToken: TokenType,
    closeToken: TokenType,
  ): ParserMethod<[], CstNode> {
    return this.RULE(name, () => {
      this.CONSUME(openToken);
      this.MANY(() => {
        this.OR([
          { ALT: () => this.CONSUME(VerbatimContent) },
          { ALT: () => this.CONSUME(Newline) },
          { ALT: () => this.CONSUME(BlankLine) },
        ]);
      });
      this.CONSUME(closeToken);
      this.OPTION(() => {
        this.CONSUME2(Newline);
      });
    });
  }

  /** Listing block: `----` delimiters with verbatim content. */
  listingBlock = this.leafBlockRule(
    "listingBlock",
    ListingBlockOpen,
    ListingBlockClose,
  );
  /**
   * Markdown-style fenced code block: ` ``` ` delimiters with
   * optional language hint. Parsed into the same CST shape as
   * listing blocks so the AST builder can produce identical
   * nodes.
   */
  fencedCodeBlock = this.leafBlockRule(
    "fencedCodeBlock",
    FencedCodeOpen,
    FencedCodeClose,
  );
  /** Literal block: `....` delimiters with verbatim content. */
  literalBlock = this.leafBlockRule(
    "literalBlock",
    LiteralBlockOpen,
    LiteralBlockClose,
  );
  /** Passthrough block: `++++` delimiters with verbatim content. */
  passBlock = this.leafBlockRule("passBlock", PassBlockOpen, PassBlockClose);

  // Factory for parent block rules. All four types (example,
  // sidebar, open, quote) share identical grammar structure:
  // open delimiter, recursive block content, close delimiter.
  private parentBlockRule(
    name: string,
    openToken: TokenType,
    closeToken: TokenType,
  ): ParserMethod<[], CstNode> {
    return this.RULE(name, () => {
      this.CONSUME(openToken);
      // When open and close are the same token type (open
      // blocks), the GATE prevents the loop from consuming
      // the close delimiter. When they differ (example,
      // sidebar, quote), the GATE is redundant but harmless.
      this.MANY({
        GATE: () => this.LA(LOOKAHEAD).tokenType !== closeToken,
        DEF: () => {
          this.OR([
            { ALT: () => this.CONSUME(BlankLine) },
            { ALT: () => this.CONSUME(Newline) },
            { ALT: () => this.SUBRULE(this.block) },
          ]);
        },
      });
      // CONSUME2 because when openToken === closeToken (open
      // blocks), Chevrotain requires numerical suffixes for
      // the second occurrence of the same token type.
      this.CONSUME2(closeToken);
      this.OPTION(() => {
        this.CONSUME2(Newline);
      });
    });
  }

  /** Example block: `====` delimiters with recursive block content. */
  exampleBlock = this.parentBlockRule(
    "exampleBlock",
    ExampleBlockOpen,
    ExampleBlockClose,
  );
  /** Sidebar block: `****` delimiters with recursive block content. */
  sidebarBlock = this.parentBlockRule(
    "sidebarBlock",
    SidebarBlockOpen,
    SidebarBlockClose,
  );
  /** Open block: `--` delimiters with recursive block content. */
  openBlock = this.parentBlockRule(
    "openBlock",
    OpenBlockDelimiter,
    OpenBlockDelimiter,
  );
  /** Quote block: `____` delimiters with recursive block content. */
  quoteBlock = this.parentBlockRule(
    "quoteBlock",
    QuoteBlockOpen,
    QuoteBlockClose,
  );

  /**
   * Literal paragraph: consecutive lines starting with one or
   * more spaces. The indented content is preserved verbatim
   * (not reflowed). A blank line or non-indented line ends it.
   */
  literalParagraph = this.RULE("literalParagraph", () => {
    this.CONSUME(IndentedLine);
    this.MANY(() => {
      this.CONSUME(Newline);
      this.CONSUME2(IndentedLine);
    });
    this.OPTION(() => {
      this.CONSUME2(Newline);
    });
  });

  /**
   * Attribute entry: a single token consumed as a block-level
   * element. The lexer handles the pattern matching; the
   * grammar just needs to recognize that an AttributeEntry
   * token is a complete block.
   */
  attributeEntry = this.RULE("attributeEntry", () => {
    this.CONSUME(AttributeEntry);
    // Consume optional trailing newline, same as other single-line
    // block elements.
    this.OPTION(() => {
      this.CONSUME(Newline);
    });
  });

  // Factory for list rules. All three list types (unordered,
  // ordered, callout) share identical grammar: one or more
  // items in sequence. Nesting is resolved later in the AST
  // builder by comparing marker depths.
  private listRule(
    name: string,
    itemRule: ParserMethod<[], CstNode>,
  ): ParserMethod<[], CstNode> {
    return this.RULE(name, () => {
      this.AT_LEAST_ONE(() => {
        this.SUBRULE(itemRule);
      });
    });
  }

  // Factory for list item rules. All three item types share
  // identical grammar: a marker token, text content, and
  // optional continuation lines (Newline + TextContent pairs).
  private listItemRule(
    name: string,
    markerToken: TokenType,
  ): ParserMethod<[], CstNode> {
    return this.RULE(name, () => {
      this.CONSUME(markerToken);
      this.CONSUME(TextContent);
      this.MANY(() => {
        this.CONSUME(Newline);
        // Continuation lines may be flush (TextContent) or
        // indented (IndentedLine) — both are part of the same
        // list item paragraph.
        this.OR([
          {
            ALT: () => {
              this.CONSUME2(TextContent);
            },
          },
          {
            ALT: () => {
              this.CONSUME(IndentedLine);
            },
          },
        ]);
      });
      this.OPTION(() => {
        this.CONSUME2(Newline);
      });
    });
  }

  /**
   * A single unordered list item: `*`{1,5} marker followed
   * by text content with optional continuation lines.
   */
  listItem = this.listItemRule("listItem", UnorderedListMarker);
  /** Unordered list: one or more unordered list items. */
  unorderedList = this.listRule("unorderedList", this.listItem);

  /**
   * Single ordered list item: `.`{1,5} marker, text content,
   * and optional continuation lines.
   */
  orderedListItem = this.listItemRule("orderedListItem", OrderedListMarker);
  /** Ordered list: one or more ordered list items. */
  orderedList = this.listRule("orderedList", this.orderedListItem);

  /**
   * Single callout list item: `<N>` marker, text content,
   * and optional continuation lines.
   */
  calloutListItem = this.listItemRule("calloutListItem", CalloutListMarker);
  /** Callout list: one or more callout list items. */
  calloutList = this.listRule("calloutList", this.calloutListItem);

  /**
   * A paragraph: one or more text lines.
   * `TextContent (Newline TextContent)* Newline?`
   */
  /**
   * An admonition paragraph: `NOTE: text`, `TIP: text`, etc.
   * The AdmonitionMarker token consumes the label prefix
   * (`NOTE: `); the remaining first-line text and any
   * continuation lines form the admonition content.
   */
  admonitionParagraph = this.RULE("admonitionParagraph", () => {
    this.CONSUME(AdmonitionMarker);
    this.OPTION(() => {
      this.CONSUME(TextContent);
    });
    this.MANY(() => {
      this.CONSUME(Newline);
      this.CONSUME2(TextContent);
    });
    this.OPTION2(() => {
      this.CONSUME2(Newline);
    });
  });

  paragraph = this.RULE("paragraph", () => {
    this.CONSUME(TextContent);
    this.MANY2(() => {
      this.CONSUME2(Newline);
      this.CONSUME2(TextContent);
    });
    this.OPTION2(() => {
      this.CONSUME3(Newline);
    });
  });
}

/** Singleton parser instance — set `.input` before each use. */
export const asciidocParser = new AsciidocParser();
