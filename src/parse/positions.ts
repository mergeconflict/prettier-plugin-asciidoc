// Token position helpers for converting Chevrotain's IToken
// positions into the Location type used by our AST.
//
// Extracted from ast-builder.ts because multiple modules need
// these helpers — having them in a shared module avoids
// duplication.
import type { IToken } from "chevrotain";
import type { Location } from "../ast.js";
import { FIRST, FIRST_COLUMN, FIRST_LINE, LAST_ELEMENT } from "../constants.js";
// Chevrotain's endOffset is inclusive; we add 1 for Prettier's
// exclusive convention.
const ONE_PAST_END = 1;

export function makeLocation(
  offset: number,
  line: number,
  column: number,
): Location {
  return { offset, line, column };
}

// Chevrotain token positions are nullable (undefined for
// tokens inserted by error recovery). We default to 1:1:0
// since our parser runs in non-error-recovery mode and these
// should never actually be undefined.
export function tokenStartLocation(token: IToken): Location {
  return makeLocation(
    token.startOffset,
    token.startLine ?? FIRST_LINE,
    token.startColumn ?? FIRST_COLUMN,
  );
}

// Same nullability handling as tokenStartLocation, plus the
// inclusive-to-exclusive conversion (+1) that Prettier expects.
export function tokenEndLocation(token: IToken): Location {
  return makeLocation(
    (token.endOffset ?? FIRST) + ONE_PAST_END,
    token.endLine ?? FIRST_LINE,
    (token.endColumn ?? FIRST_COLUMN) + ONE_PAST_END,
  );
}

// The document's end position can't come from a token because
// the last token may be followed by trailing whitespace/newlines
// that the lexer consumed but didn't emit. We compute it from
// the raw source text instead.
export function computeEnd(text: string): Location {
  const lines = text.split("\n");
  const lastLine = lines.at(LAST_ELEMENT) ?? "";
  return makeLocation(
    text.length,
    lines.length,
    lastLine.length + FIRST_COLUMN,
  );
}
