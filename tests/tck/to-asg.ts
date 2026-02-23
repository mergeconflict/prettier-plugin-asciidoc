/**
 * Converts our AST to the AsciiDoc Abstract Semantic Graph (ASG)
 * format used by the official TCK (Technology Compatibility Kit)
 * tests.
 *
 * Test-only module — not shipped with the plugin. Validates our
 * parser produces semantically correct output by comparing
 * against the canonical expected outputs from asciidoc-tck.
 *
 * Current limitations:
 * - Inline content is emitted as raw text spans (no bold/etc.)
 * - Block metadata not yet propagated onto the following block
 */

import type {
  AdmonitionNode,
  BlockNode,
  DelimitedBlockNode,
  DiscreteHeadingNode,
  DocumentNode,
  DocumentTitleNode,
  InlineNode,
  ListItemNode,
  ListNode,
  Location,
  Node,
  PageBreakNode,
  ParagraphNode,
  ParentBlockNode,
  SectionNode,
  TextNode,
  ThematicBreakNode,
} from "../../src/ast.js";
import type {
  AsgBlock,
  AsgBreak,
  AsgDiscreteHeading,
  AsgDocument,
  AsgInline,
  AsgLeafBlock,
  AsgList,
  AsgListItem,
  AsgLocation,
  AsgParagraph,
  AsgParentBlock,
  AsgSection,
} from "./asg-types.js";

// -- Delimiters -------------------------------------------------

const LEAF_DELIMITERS: Record<string, string> = {
  listing: "----",
  literal: "....",
  pass: "++++",
};

const PARENT_DELIMITERS: Record<string, string> = {
  example: "====",
  sidebar: "****",
  open: "--",
  quote: "____",
};

function listMarker(variant: ListNode["variant"], depth: number): string {
  switch (variant) {
    case "unordered": {
      return "*".repeat(depth);
    }
    case "ordered": {
      return ".".repeat(depth);
    }
    case "callout": {
      return "<.>";
    }
  }
}

// -- Location conversion ----------------------------------------

// Our end column is exclusive (one past last char); ASG end col
// is inclusive (the last char itself).
function toAsgLocation(node: Node): AsgLocation {
  return [
    { line: node.position.start.line, col: node.position.start.column },
    { line: node.position.end.line, col: node.position.end.column - 1 },
  ];
}

function locationFromPair(start: Location, end: Location): AsgLocation {
  return [
    { line: start.line, col: start.column },
    { line: end.line, col: end.column - 1 },
  ];
}

// -- Inlines ----------------------------------------------------

// Flatten inline nodes to raw text for ASG (which only has
// a "text" inline type). All formatting marks, attribute
// references, etc. are serialized back to their source form.
function inlineNodeToText(node: InlineNode): string {
  const childrenToText = (children: InlineNode[]): string =>
    children.map((child) => inlineNodeToText(child)).join("");
  switch (node.type) {
    case "text": {
      return node.value;
    }
    case "attributeReference": {
      return `{${node.name}}`;
    }
    case "bold": {
      const mark = node.constrained ? "*" : "**";
      return `${mark}${childrenToText(node.children)}${mark}`;
    }
    case "italic": {
      const mark = node.constrained ? "_" : "__";
      return `${mark}${childrenToText(node.children)}${mark}`;
    }
    case "monospace": {
      const mark = node.constrained ? "`" : "``";
      return `${mark}${childrenToText(node.children)}${mark}`;
    }
    case "highlight": {
      const mark = node.constrained ? "#" : "##";
      const rolePrefix = node.role === undefined ? "" : `[${node.role}]`;
      return `${rolePrefix}${mark}${childrenToText(node.children)}${mark}`;
    }
  }
}

function convertInlines(nodes: InlineNode[]): AsgInline[] {
  // The ASG expects a single "text" inline spanning the full
  // paragraph content. Merge all inline nodes back to text.
  if (nodes.length === 0) {
    return [];
  }
  const value = nodes.map((child) => inlineNodeToText(child)).join("");
  // Use the position of the first and last node to span
  // the entire inline content.
  const [first] = nodes;
  const last = nodes.at(-1) ?? first;
  return [
    {
      name: "text" as const,
      type: "string" as const,
      value,
      location: toAsgLocation({
        ...first,
        position: {
          start: first.position.start,
          end: last.position.end,
        },
      }),
    },
  ];
}

// -- Block filtering --------------------------------------------

// ASG omits comments, attribute entries, block attribute lists,
// anchors, and block titles.
function isAsgVisible(node: BlockNode): boolean {
  return (
    node.type !== "comment" &&
    node.type !== "attributeEntry" &&
    node.type !== "blockAttributeList" &&
    node.type !== "blockAnchor" &&
    node.type !== "blockTitle"
  );
}

function filterVisible(nodes: BlockNode[]): BlockNode[] {
  return nodes.filter((n) => isAsgVisible(n));
}

// -- Block conversion -------------------------------------------

function convertParagraph(node: ParagraphNode): AsgParagraph {
  return {
    name: "paragraph",
    type: "block",
    inlines: convertInlines(node.children),
    location: toAsgLocation(node),
  };
}

// Returns the effective end position of a block, recursing
// into sections whose position covers only the heading line.
function blockEffectiveEnd(node: BlockNode): Location {
  if (node.type === "section") {
    const last = filterVisible(node.children).at(-1);
    if (last !== undefined) {
      return blockEffectiveEnd(last);
    }
  }
  return node.position.end;
}

function sectionLocation(node: SectionNode): AsgLocation {
  const last = filterVisible(node.children).at(-1);
  if (last !== undefined) {
    return locationFromPair(node.position.start, blockEffectiveEnd(last));
  }
  return toAsgLocation(node);
}

// Builds ASG inline text nodes for a heading title. Title
// text starts after "={level+1} " (equals signs + space).
function headingTitleInlines(
  start: Location,
  level: number,
  heading: string,
): AsgInline[] {
  const markerWidth = level + 2;
  const titleStart: Location = {
    offset: start.offset + markerWidth,
    line: start.line,
    column: start.column + markerWidth,
  };
  const titleEnd: Location = {
    offset: titleStart.offset + heading.length,
    line: start.line,
    column: titleStart.column + heading.length,
  };
  return [
    {
      name: "text",
      type: "string",
      value: heading,
      location: locationFromPair(titleStart, titleEnd),
    },
  ];
}

function convertSection(node: SectionNode): AsgSection {
  const visible = filterVisible(node.children);
  return {
    name: "section",
    type: "block",
    title: headingTitleInlines(node.position.start, node.level, node.heading),
    level: node.level,
    blocks: visible.map((c) => convertBlock(c)),
    location: sectionLocation(node),
  };
}

function convertList(node: ListNode): AsgList {
  const { children } = node;
  const [firstItem] = children;
  const { depth } = firstItem;
  const marker = listMarker(node.variant, depth);
  return {
    name: "list",
    type: "block",
    variant: node.variant,
    marker,
    items: children.map((item) => convertListItem(item, marker)),
    location: toAsgLocation(node),
  };
}

function convertListItem(node: ListItemNode, marker: string): AsgListItem {
  const inlines = node.children.filter(
    (child): child is TextNode => child.type === "text",
  );
  return {
    name: "listItem",
    type: "block",
    marker,
    principal: convertInlines(inlines),
    location: toAsgLocation(node),
  };
}

function convertDelimitedBlock(node: DelimitedBlockNode): AsgLeafBlock {
  const delimiter = LEAF_DELIMITERS[node.variant] ?? "----";
  const inlines: AsgInline[] = [];
  if (node.content.length > 0) {
    const contentStartLine = node.position.start.line + 1;
    const contentLines = node.content.split("\n");
    const lastContentLine = contentStartLine + contentLines.length - 1;
    const lastLine = contentLines.at(-1) ?? "";
    inlines.push({
      name: "text",
      type: "string",
      value: node.content,
      location: [
        { line: contentStartLine, col: 1 },
        { line: lastContentLine, col: lastLine.length },
      ],
    });
  }
  return {
    name: node.variant,
    type: "block",
    form: node.form,
    delimiter,
    inlines,
    location: toAsgLocation(node),
  };
}

function convertParentBlock(node: ParentBlockNode): AsgParentBlock {
  const delimiter = PARENT_DELIMITERS[node.variant] ?? "====";
  const visible = filterVisible(node.children);
  return {
    name: node.variant,
    type: "block",
    form: "delimited",
    delimiter,
    blocks: visible.map((c) => convertBlock(c)),
    location: toAsgLocation(node),
  };
}

function convertAdmonition(node: AdmonitionNode): AsgParentBlock {
  const delimiter =
    node.delimiter === undefined
      ? "===="
      : (PARENT_DELIMITERS[node.delimiter] ?? "====");
  const visible = filterVisible(node.children);
  return {
    name: "admonition",
    type: "block",
    form: node.form,
    delimiter,
    variant: node.variant.toLowerCase(),
    blocks: visible.map((c) => convertBlock(c)),
    location: toAsgLocation(node),
  };
}

function convertDiscreteHeading(node: DiscreteHeadingNode): AsgDiscreteHeading {
  return {
    name: "heading",
    type: "block",
    title: headingTitleInlines(node.position.start, node.level, node.heading),
    level: node.level,
    location: toAsgLocation(node),
  };
}

function convertBreak(node: ThematicBreakNode | PageBreakNode): AsgBreak {
  return {
    name: "break",
    type: "block",
    variant: node.type === "thematicBreak" ? "thematic" : "page",
    location: toAsgLocation(node),
  };
}

function convertBlock(node: BlockNode): AsgBlock {
  switch (node.type) {
    case "paragraph": {
      return convertParagraph(node);
    }
    case "section": {
      return convertSection(node);
    }
    case "list": {
      return convertList(node);
    }
    case "delimitedBlock": {
      return convertDelimitedBlock(node);
    }
    case "parentBlock": {
      return convertParentBlock(node);
    }
    case "admonition": {
      return convertAdmonition(node);
    }
    case "discreteHeading": {
      return convertDiscreteHeading(node);
    }
    case "thematicBreak":
    case "pageBreak": {
      return convertBreak(node);
    }
    // Filtered out upstream, but TypeScript needs exhaustive handling.
    case "comment":
    case "attributeEntry":
    case "blockAttributeList":
    case "blockAnchor":
    case "blockTitle":
    case "documentTitle": {
      return {
        name: "paragraph",
        type: "block",
        inlines: [],
        location: toAsgLocation(node),
      };
    }
  }
}

// -- Document header extraction ---------------------------------

interface HeaderInfo {
  title: DocumentTitleNode;
  attributes: Record<string, string>;
  headerEndLocation: Location;
  consumed: number;
}

function extractHeader(children: BlockNode[]): HeaderInfo | undefined {
  if (children.length === 0) {
    return undefined;
  }
  const [first] = children;
  if (first.type !== "documentTitle") {
    return undefined;
  }
  const attributes: Record<string, string> = {};
  let lastHeaderNode: BlockNode = first;
  let consumed = 1;
  // Attribute entries immediately following the title are part
  // of the header.
  for (const child of children.slice(1)) {
    if (child.type === "attributeEntry") {
      attributes[child.name] = child.value ?? "";
      lastHeaderNode = child;
      consumed += 1;
    } else {
      break;
    }
  }
  return {
    title: first,
    attributes,
    headerEndLocation: lastHeaderNode.position.end,
    consumed,
  };
}

// -- Document location ------------------------------------------

function computeDocumentLocation(
  document: DocumentNode,
  header: HeaderInfo | undefined,
  bodyChildren: BlockNode[],
): AsgLocation {
  const { position } = document;
  const lastBody = bodyChildren.at(-1);
  if (lastBody !== undefined) {
    return locationFromPair(position.start, blockEffectiveEnd(lastBody));
  }
  if (header !== undefined) {
    return locationFromPair(position.start, header.headerEndLocation);
  }
  return toAsgLocation(document);
}

// -- Public API -------------------------------------------------

/**
 * Converts our parser's AST into the ASG format used by the
 * official AsciiDoc TCK conformance tests.
 * Test-only utility — not shipped with the plugin.
 */
export function toASG(document: DocumentNode): AsgDocument {
  const header = extractHeader(document.children);
  const bodyStart = header?.consumed ?? 0;
  const bodyChildren = document.children
    .slice(bodyStart)
    .filter((n) => isAsgVisible(n));
  const documentLocation = computeDocumentLocation(
    document,
    header,
    bodyChildren,
  );

  const blocks = bodyChildren.map((c) => convertBlock(c));
  // TCK expected outputs omit blocks when empty.
  const result: AsgDocument = {
    name: "document",
    type: "block",
    ...(blocks.length > 0 ? { blocks } : {}),
    location: documentLocation,
  };
  if (header !== undefined) {
    const { title: titleNode, attributes, headerEndLocation } = header;
    const { position: titlePosition } = titleNode;
    const titleTextStart: Location = {
      offset: titlePosition.start.offset + 2,
      line: titlePosition.start.line,
      column: titlePosition.start.column + 2,
    };
    const titleTextEnd: Location = {
      offset: titleTextStart.offset + titleNode.title.length,
      line: titlePosition.start.line,
      column: titleTextStart.column + titleNode.title.length,
    };
    result.attributes = attributes;
    result.header = {
      title: [
        {
          name: "text",
          type: "string",
          value: titleNode.title,
          location: locationFromPair(titleTextStart, titleTextEnd),
        },
      ],
      location: locationFromPair(titlePosition.start, headerEndLocation),
    };
  }
  return result;
}

/**
 * Converts our inline nodes to ASG inline format, for use with
 * inline-only TCK fixtures that expect just an inlines array
 * rather than a full document.
 */
export function toASGInlines(nodes: InlineNode[]): AsgInline[] {
  return convertInlines(nodes);
}
