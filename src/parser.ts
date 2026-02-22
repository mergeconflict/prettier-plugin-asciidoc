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

// Prettier calls locStart/locEnd to determine node positions for cursor
// tracking and range formatting. They must be top-level named exports.
function locStart(node: BlockNode | DocumentNode): number {
  return node.position.start.offset;
}

function locEnd(node: BlockNode | DocumentNode): number {
  return node.position.end.offset;
}

// Type guard avoids an unsafe `as` cast. Chevrotain's visitor returns `unknown`
// because it can't know our AST types — this verifies the shape at runtime.
function isDocumentNode(value: unknown): value is DocumentNode {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "document"
  );
}

/** Run the full parse pipeline: lex → parse → build AST. */
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
