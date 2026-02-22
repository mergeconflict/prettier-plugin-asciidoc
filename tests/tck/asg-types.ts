/**
 * ASG (Abstract Semantic Graph) type definitions for the
 * output shapes produced by the toASG() converter. These types
 * model the official AsciiDoc ASG schema as used in the TCK
 * (Technology Compatibility Kit) expected outputs.
 */

// ASG location: pair of {line, col} boundaries, both 1-based
// and inclusive (end points at the last character, not past it
// like our AST does).
export interface AsgLocationBoundary {
  line: number;
  col: number;
}
export type AsgLocation = [AsgLocationBoundary, AsgLocationBoundary];

export interface AsgText {
  name: "text";
  type: "string";
  value: string;
  location: AsgLocation;
}

export interface AsgParagraph {
  name: "paragraph";
  type: "block";
  inlines: AsgInline[];
  location: AsgLocation;
}

export interface AsgSection {
  name: "section";
  type: "block";
  title: AsgInline[];
  level: number;
  blocks: AsgBlock[];
  location: AsgLocation;
}

export interface AsgList {
  name: "list";
  type: "block";
  variant: "unordered" | "ordered" | "callout";
  marker: string;
  items: AsgListItem[];
  location: AsgLocation;
}

export interface AsgListItem {
  name: "listItem";
  type: "block";
  marker: string;
  principal: AsgInline[];
  location: AsgLocation;
}

export interface AsgLeafBlock {
  name: string;
  type: "block";
  form: string;
  delimiter: string;
  inlines: AsgInline[];
  location: AsgLocation;
}

export interface AsgParentBlock {
  name: string;
  type: "block";
  form: string;
  delimiter: string;
  blocks: AsgBlock[];
  location: AsgLocation;
  variant?: string;
}

export interface AsgDiscreteHeading {
  name: "heading";
  type: "block";
  title: AsgInline[];
  level: number;
  location: AsgLocation;
}

export interface AsgBreak {
  name: "break";
  type: "block";
  variant: "thematic" | "page";
  location: AsgLocation;
}

export interface AsgHeader {
  title: AsgInline[];
  location: AsgLocation;
}

export interface AsgDocument {
  name: "document";
  type: "block";
  attributes?: Record<string, string>;
  header?: AsgHeader;
  blocks?: AsgBlock[];
  location: AsgLocation;
}

export type AsgInline = AsgText;
export type AsgBlock =
  | AsgParagraph
  | AsgSection
  | AsgList
  | AsgLeafBlock
  | AsgParentBlock
  | AsgDiscreteHeading
  | AsgBreak;
