/**
 * Parser pipeline:
 * source text → lexer → CST parser → AST builder → AST.
 *
 * This module orchestrates the three Chevrotain phases and exports the result
 * as a Prettier parser object. The parser instance and AST builder are reused
 * across calls (Chevrotain is designed for this —
 * set `.input` to reset state).
 *
 * We also export `parse` as a named export so tests can call it directly
 * without going through Prettier's formatting pipeline.
 */
import type { Parser } from "prettier";
import type { DocumentNode, BlockNode } from "./ast.js";
import { asciidocLexer } from "./parse/tokens.js";
import { asciidocParser } from "./parse/grammar.js";
import { AstBuilder } from "./parse/ast-builder.js";
import { unreachable } from "./unreachable.js";
const astBuilder = new AstBuilder();

/**
 * Return a node's start offset for Prettier's cursor
 * tracking and range formatting.
 * @param node - Any AST node with a position
 * @returns Zero-based start offset in source text
 */
function locStart(node: BlockNode | DocumentNode): number {
  return node.position.start.offset;
}

/**
 * Return a node's end offset for Prettier's cursor
 * tracking and range formatting.
 * @param node - Any AST node with a position
 * @returns Zero-based exclusive end offset in source
 */
function locEnd(node: BlockNode | DocumentNode): number {
  return node.position.end.offset;
}

/**
 * Type guard: verify that the AST builder returned a
 * DocumentNode. Chevrotain's visitor returns `unknown`,
 * so this avoids an unsafe `as` cast.
 * @param value - Return value from astBuilder.visit()
 * @returns True when value is a DocumentNode
 */
function isDocumentNode(value: unknown): value is DocumentNode {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "document"
  );
}

/**
 * Run the full parse pipeline: lex, parse, build AST.
 *
 * This is both the Prettier `Parser.parse` entry point and a
 * named export so tests can exercise the parser directly
 * without going through Prettier's formatting pipeline.
 * @param text - Full AsciiDoc source document
 * @returns Root DocumentNode of the AST
 */
export function parse(text: string): DocumentNode {
  // The lexer may produce errors for unrecognized characters,
  // but still returns a usable token stream. We don't throw
  // on lexer errors — the formatter should degrade gracefully
  // rather than crash on input it doesn't fully understand.
  const { tokens } = asciidocLexer.tokenize(text);

  asciidocParser.input = tokens;
  const cst = asciidocParser.document();

  // Chevrotain's recovery strategies (enabled via
  // recoveryEnabled: true) produce a partial CST even when
  // rules fail. The CST may contain recoveredNode flags, but
  // the AST builder handles these — recovered regions pass
  // through as whatever partial structure was recognized.
  // We don't throw on parser errors for the same reason as
  // lexer errors: partial output beats a crash.

  const result: unknown = astBuilder.visit(cst, text);
  if (!isDocumentNode(result)) {
    unreachable("AST builder did not return a DocumentNode");
  }
  return result;
}

const parser: Parser<DocumentNode> = {
  parse,
  astFormat: "asciidoc-ast",
  locStart,
  locEnd,
};

export default parser;
export { locStart, locEnd };
