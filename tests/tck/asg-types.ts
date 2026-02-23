/**
 * TypeScript mirror of the official AsciiDoc ASG (Abstract
 * Semantic Graph) schema, scoped to the node types this plugin
 * currently exercises. The authoritative schema is at
 * `vendor/asciidoc-asg/schema.json`; these types must stay in
 * sync with it.
 *
 * Used exclusively by `toASG()` and the TCK conformance tests —
 * not shipped with the plugin.
 *
 * Where these types deviate from the full schema (e.g. narrowed
 * unions, omitted optional fields), a comment on the relevant
 * type explains the reason.
 */

/**
 * One end of an ASG source location range. Both line and col
 * are 1-based. The end boundary is *inclusive* — it points at
 * the last character of the span, not one past it. This differs
 * from our internal AST, where end column is exclusive.
 */
export interface AsgLocationBoundary {
  /** 1-based line number in the source file. */
  line: number;
  /** 1-based column number within the line (inclusive end). */
  col: number;
}

/** Source range as [start, end] boundary pair. */
export type AsgLocation = [AsgLocationBoundary, AsgLocationBoundary];

/**
 * Literal inline content (text, character reference, or
 * raw passthrough). Corresponds to `inlineLiteral` in the
 * ASG schema.
 */
export interface AsgInlineLiteral {
  /** ASG node name: "text", "charref", or "raw". */
  name: "text" | "charref" | "raw";
  /** ASG node type, always "string" for literals. */
  type: "string";
  /** The text content. */
  value: string;
  /** Source location of this literal span. */
  location?: AsgLocation;
}

/**
 * An inline formatting span (bold, italic, monospace, or
 * highlight). Corresponds to `inlineSpan` in the ASG schema.
 */
export interface AsgInlineSpan {
  /** ASG node name, always "span". */
  name: "span";
  /** ASG node type, always "inline" for parent inlines. */
  type: "inline";
  /** Formatting variant. */
  variant: "strong" | "emphasis" | "code" | "mark";
  /** Constrained (`*bold*`) vs unconstrained (`**bold**`). */
  form: "constrained" | "unconstrained";
  /** Child inlines within this span. */
  inlines: AsgInline[];
  /** Source location including delimiters. */
  location?: AsgLocation;
}

/**
 * An inline reference (link or cross-reference). Corresponds
 * to `inlineRef` in the ASG schema.
 */
export interface AsgInlineReference {
  /** ASG node name, always "ref". */
  name: "ref";
  /** ASG node type, always "inline" for parent inlines. */
  type: "inline";
  /** Reference variant. */
  variant: "link" | "xref";
  /** The link target URL or xref ID. */
  target: string;
  /** Display inlines (link text). */
  inlines: AsgInline[];
  /** Source location of the full reference. */
  location?: AsgLocation;
}

/**
 * A paragraph block containing inline content. In the official
 * schema, `"paragraph"` is one variant of `leafBlock` (alongside
 * `"listing"`, `"literal"`, etc.) and carries `form` and
 * `delimiter` fields. TCK paragraph fixtures omit those fields,
 * so this interface omits them too. See `AsgLeafBlock` for the
 * full leaf block shape.
 */
export interface AsgParagraph {
  /** ASG node name, always "paragraph". */
  name: "paragraph";
  /** ASG node type, always "block". */
  type: "block";
  /** Inline content of the paragraph. */
  inlines: AsgInline[];
  /** Source location of the paragraph. */
  location: AsgLocation;
}

/** A document section with a title and nested blocks. */
export interface AsgSection {
  /** ASG node name, always "section". */
  name: "section";
  /** ASG node type, always "block". */
  type: "block";
  /** Inline content forming the section title. */
  title: AsgInline[];
  /**
   * Heading level (1-5). Level 0 is reserved by the schema for
   * structural completeness but does not appear in practice for
   * `section` nodes; the document title lives in
   * `AsgDocument.header.title`, not here.
   */
  level: number;
  /** Child blocks within this section. */
  blocks: AsgBlock[];
  /** Source location of the section. */
  location: AsgLocation;
}

/** An ordered, unordered, or callout list. */
export interface AsgList {
  /** ASG node name, always "list". */
  name: "list";
  /** ASG node type, always "block". */
  type: "block";
  /** List kind: unordered, ordered, or callout. */
  variant: "unordered" | "ordered" | "callout";
  /** The list marker string (e.g. "*", ".", "<.>"). */
  marker: string;
  /** The list items. */
  items: AsgListItem[];
  /** Source location of the list. */
  location: AsgLocation;
}

/** A single item within a list. */
export interface AsgListItem {
  /** ASG node name, always "listItem". */
  name: "listItem";
  /** ASG node type, always "block". */
  type: "block";
  /** The marker string for this item. */
  marker: string;
  /** Inline content of the item's principal text. */
  principal: AsgInline[];
  /** Source location of the list item. */
  location: AsgLocation;
}

/**
 * A leaf block with inline content. Valid names per the schema:
 * `"listing"`, `"literal"`, `"paragraph"`, `"pass"`, `"stem"`,
 * `"verse"`. Note: in the official schema, `"paragraph"` is a
 * leaf block variant; `AsgParagraph` below is a simplified
 * projection that omits `form` and `delimiter` since TCK
 * paragraph fixtures never include them.
 */
export interface AsgLeafBlock {
  /** ASG block name — one of the six leaf block types. */
  name: string;
  /** ASG node type, always "block". */
  type: "block";
  /** Block form: "delimited", "indented", or "paragraph". */
  form: string;
  /** The delimiter string (e.g. "----", "...."). */
  delimiter?: string;
  /** Inline content within the leaf block. */
  inlines: AsgInline[];
  /** Source location of the block. */
  location: AsgLocation;
}

/**
 * A parent block containing child blocks. Valid names per the
 * schema: `"admonition"`, `"example"`, `"sidebar"`, `"open"`,
 * `"quote"`. Always has `form: "delimited"`.
 */
export interface AsgParentBlock {
  /** ASG block name — one of the five parent block types. */
  name: string;
  /** ASG node type, always "block". */
  type: "block";
  /** Block form, always "delimited" for parent blocks. */
  form: string;
  /** The delimiter string (e.g. "****", "===="). */
  delimiter: string;
  /** Child blocks within this parent block. */
  blocks: AsgBlock[];
  /** Source location of the block. */
  location: AsgLocation;
  /**
   * Admonition type, present only when `name` is
   * `"admonition"`. One of `"caution"`, `"important"`,
   * `"note"`, `"tip"`, or `"warning"` (lowercase).
   */
  variant?: string;
}

/** A discrete heading (not tied to a section). */
export interface AsgDiscreteHeading {
  /** ASG node name, always "heading" for discrete. */
  name: "heading";
  /** ASG node type, always "block". */
  type: "block";
  /** Inline content forming the heading title. */
  title: AsgInline[];
  /**
   * Heading level (0-5). Level 0 is the document title;
   * discrete headings in practice start at level 1.
   */
  level: number;
  /** Source location of the heading. */
  location: AsgLocation;
}

/** A thematic or page break. */
export interface AsgBreak {
  /** ASG node name, always "break". */
  name: "break";
  /** ASG node type, always "block". */
  type: "block";
  /** Break kind: "thematic" or "page". */
  variant: "thematic" | "page";
  /** Source location of the break. */
  location: AsgLocation;
}

/**
 * The document header (title and metadata). The official
 * ASG schema also includes an `authors` field, but we omit
 * it because our parser does not yet extract author lines.
 */
export interface AsgHeader {
  /** Inline content forming the document title. */
  title: AsgInline[];
  /** Source location of the header. */
  location: AsgLocation;
}

/** The root document node in the ASG. */
export interface AsgDocument {
  /** ASG node name, always "document". */
  name: "document";
  /** ASG node type, always "block". */
  type: "block";
  /**
   * Document-level attribute entries keyed by name, without
   * surrounding colons (e.g. key `"toc"` for `:toc:`). Present
   * whenever a document header is present (required by schema
   * when `header` is set).
   */
  attributes?: Record<string, string>;
  /** The document header, if present. */
  header?: AsgHeader;
  /** Top-level blocks in the document body. */
  blocks?: AsgBlock[];
  /** Source location of the document. */
  location: AsgLocation;
}

/**
 * Union of all inline ASG node types. Matches the `inline`
 * discriminated union in the ASG schema (discriminated on
 * `name`: "span" | "ref" | "text" | "charref" | "raw").
 */
export type AsgInline = AsgInlineLiteral | AsgInlineSpan | AsgInlineReference;

/**
 * Union of all block ASG node types. The official schema
 * also includes `dlist` (description list) and `blockMacro`
 * types, which are not yet implemented in our parser.
 */
export type AsgBlock =
  | AsgParagraph
  | AsgSection
  | AsgList
  | AsgLeafBlock
  | AsgParentBlock
  | AsgDiscreteHeading
  | AsgBreak;
