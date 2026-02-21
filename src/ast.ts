/**
 * AST types for prettier-plugin-asciidoc.
 *
 * These types are designed for Prettier, not the official AsciiDoc ASG.
 * The ASG intentionally discards comments, attribute entries, and directives,
 * but a formatter must preserve them. Our AST retains everything the source
 * contains so the printer can reproduce it faithfully.
 *
 * Position information uses exclusive end offsets (one past the last character)
 * to match Prettier's conventions, unlike Chevrotain's inclusive offsets.
 */

/**
 * A point in the source text.
 * Line and column are 1-based; offset is 0-based.
 */
export interface Location {
  offset: number;
  line: number;
  column: number;
}

/**
 * Every AST node carries a position with start (inclusive) and end (exclusive).
 * Prettier uses locStart/locEnd for cursor tracking and range formatting;
 * having positions on every node ensures those features work correctly.
 */
export interface Node {
  type: string;
  position: {
    start: Location;
    end: Location;
  };
}

/**
 * Root node. Prettier requires a single root; children are block-level
 * elements.
 */
export interface DocumentNode extends Node {
  type: "document";
  children: BlockNode[];
}

/** A paragraph contains inline nodes (currently just text). */
export interface ParagraphNode extends Node {
  type: "paragraph";
  children: InlineNode[];
}

/** Raw text content. Lines within a paragraph are joined with \n in `value`. */
export interface TextNode extends Node {
  type: "text";
  value: string;
}

/** Content that appears within a paragraph (text, emphasis, links, etc.). */
// TODO: Will become a union as inline parsing is added.
export type InlineNode = TextNode;

/**
 * A section heading and its child blocks. Level is 0-indexed (level 0 = "==",
 * level 4 = "======") to match the ASG convention. The grammar parses sections
 * flat; the AST builder groups subsequent blocks under their heading.
 */
export interface SectionNode extends Node {
  type: "section";
  level: number;
  heading: string;
  children: BlockNode[];
}

/**
 * A discrete heading — a heading preceded by `[discrete]` that does
 * not create a section. Unlike `SectionNode`, it has no `children`
 * array and does not participate in section nesting.
 */
export interface DiscreteHeadingNode extends Node {
  type: "discreteHeading";
  level: number;
  heading: string;
}

/**
 * A comment node. AsciiDoc has two comment forms:
 * - Line comment: `// text` (two slashes then space or EOL)
 * - Block comment: delimited by `////` (4+ slashes) on own line
 *
 * Comments are discarded by the ASG, but our AST preserves them so the
 * formatter can reproduce them faithfully.
 */
export interface CommentNode extends Node {
  type: "comment";
  commentType: "line" | "block";
  value: string;
}

/**
 * An attribute entry: `:name: value` metadata declaration.
 *
 * AsciiDoc attribute entries set document-level metadata (author, revdate)
 * or configure toolchain behavior (source-highlighter, toc). The ASG
 * discards them, but a formatter must preserve them to avoid losing
 * configuration and metadata.
 *
 * Syntax variants:
 * - `:name: value` — set with value
 * - `:name:` — set with no value (boolean/flag)
 * - `:!name:` or `:name!:` — unset (negation)
 */
export interface AttributeEntryNode extends Node {
  type: "attributeEntry";
  /** Clean attribute name without `!` prefix/suffix. */
  name: string;
  /** Value text, or undefined for no-value entries like `:toc:`. */
  value: string | undefined;
  /**
   * Whether this entry unsets the attribute and which syntax form
   * was used. `false` means the attribute is set (not negated).
   * `"prefix"` means `:!name:` form; `"suffix"` means `:name!:`.
   * Tracking the form lets the printer reproduce the original syntax.
   */
  unset: false | "prefix" | "suffix";
}

/**
 * The document title: `= Title` (level 0 heading).
 *
 * In AsciiDoc, the document title uses a single `=` marker, unlike
 * section headings which use `==` through `======`. There can be at
 * most one document title per document, and it must appear before any
 * section headings. It's a standalone block (not a container like
 * SectionNode) because the header grouping of title + author +
 * revision + attributes is handled by join logic in the printer,
 * not by AST nesting.
 */
export interface DocumentTitleNode extends Node {
  type: "documentTitle";
  title: string;
}

/**
 * An unordered, ordered, or callout list.
 *
 * AsciiDoc lists use repeated markers for nesting: `*` / `**` / `***`
 * for unordered, `.` / `..` / `...` for ordered. Callout lists use
 * `<N>` or `<.>` markers and are always flat (no nesting). The
 * `variant` field distinguishes the three forms. Nesting is
 * represented by ListItemNode children that themselves contain a
 * nested ListNode.
 */
export interface ListNode extends Node {
  type: "list";
  variant: "unordered" | "ordered" | "callout";
  children: ListItemNode[];
}

/**
 * A delimited leaf block whose content is preserved verbatim
 * (no inline parsing). Covers listing (`----`), literal (`....`),
 * and passthrough (`++++`) blocks.
 *
 * **Valid variant+form combinations:**
 * - `listing | literal | pass` with `form: "delimited"` — fenced
 * - `literal` with `form: "indented"` — literal paragraph
 * - any variant with `form: "paragraph"` — attribute + paragraph
 *
 * Parent-block variants (`example | sidebar | quote`) use
 * `ParentBlockNode` when delimited, not this type.
 */
export interface DelimitedBlockNode extends Node {
  type: "delimitedBlock";
  variant:
    | "listing"
    | "literal"
    | "pass"
    | "example"
    | "sidebar"
    | "quote"
    | "verse";
  /**
   * How the block was expressed in source: delimiters,
   * indentation, or paragraph form (attribute list + text).
   */
  form: "delimited" | "indented" | "paragraph";
  content: string;
}

/** A parent block contains structured child blocks (parsed recursively). */
export interface ParentBlockNode extends Node {
  type: "parentBlock";
  variant: "example" | "sidebar" | "open" | "quote";
  children: BlockNode[];
}

/**
 * An admonition block (NOTE, TIP, IMPORTANT, CAUTION, WARNING).
 *
 * Admonitions come in two forms:
 * - **paragraph**: `NOTE: text` — inline label prefix on a
 *   paragraph. Content is stored in `content` (reflowable text).
 * - **delimited**: `[NOTE]` + `====`/`--` — block attribute list
 *   on a parent block. Content is stored in `children`.
 *
 * Paragraph-form admonitions have `content` and empty `children`;
 * block-form have `children` and `undefined` content.
 */
export interface AdmonitionNode extends Node {
  type: "admonition";
  variant: string;
  form: "paragraph" | "delimited";
  // For delimited form: which parent block delimiter wraps the
  // content (example `====` or open `--`). Undefined for
  // paragraph form.
  delimiter: ParentBlockNode["variant"] | undefined;
  content: string | undefined;
  children: BlockNode[];
}

/** A thematic break: `'''` (three or more single quotes). */
export interface ThematicBreakNode extends Node {
  type: "thematicBreak";
}

/** A page break: `<<<` (three or more less-than signs). */
export interface PageBreakNode extends Node {
  type: "pageBreak";
}

/**
 * A single item within a list.
 *
 * A list item contains inline content (its principal text) and
 * optionally nested child lists. The `depth` field records the
 * original marker depth (number of `*` or `.` characters) for
 * the printer to reproduce.
 */
export interface ListItemNode extends Node {
  type: "listItem";
  depth: number;
  /** Checkbox state for checklist items. `undefined` for normal
   * list items, `"checked"` for `[x]` or `[*]`, `"unchecked"`
   * for `[ ]`. Only meaningful on unordered list items. */
  checkbox: "checked" | "unchecked" | undefined;
  /** The callout number for callout list items (e.g. 1 for
   * `<1>`). `undefined` for non-callout items. Use 0 for
   * auto-numbered (`<.>`) callouts. */
  calloutNumber: number | undefined;
  children: Array<InlineNode | ListNode>;
}

/** A top-level structural element of a document. */

/**
 * A block attribute list: `[source,ruby]`, `[#myid]`, `[.role]`, etc.
 *
 * Block attribute lists appear on their own line immediately before a
 * block and set positional or named attributes on it. The ASG attaches
 * these to the block as metadata, but our AST keeps them as standalone
 * nodes and lets the printer handle stacking.
 *
 * The `value` field contains the raw content between the brackets
 * (e.g. `"source,ruby"` for `[source,ruby]`). We preserve the raw
 * text so the printer can reproduce the original syntax faithfully.
 */
export interface BlockAttributeListNode extends Node {
  type: "blockAttributeList";
  value: string;
}

/**
 * A block anchor: `[[anchor-id]]` or `[[id,reftext]]`.
 *
 * Block anchors create a cross-reference target at the block that
 * follows them. The `id` field holds just the identifier; the
 * optional `reftext` holds the display text after the comma.
 */
export interface BlockAnchorNode extends Node {
  type: "blockAnchor";
  id: string;
  reftext: string | undefined;
}

/**
 * A block title: `.Title text`.
 *
 * Block titles appear on their own line immediately before a block
 * and set the block's title. The leading dot is syntactic (not stored
 * in `title`). The `title` field contains the text after the dot.
 */
export interface BlockTitleNode extends Node {
  type: "blockTitle";
  title: string;
}

export type BlockNode =
  | ParagraphNode
  | SectionNode
  | DiscreteHeadingNode
  | CommentNode
  | AttributeEntryNode
  | DocumentTitleNode
  | ListNode
  | DelimitedBlockNode
  | ParentBlockNode
  | AdmonitionNode
  | ThematicBreakNode
  | PageBreakNode
  | BlockAttributeListNode
  | BlockAnchorNode
  | BlockTitleNode;
