/**
 * Shared numeric constants used across the parser and printer.
 *
 * These replace magic numbers (0, 1) with named values that convey
 * intent. Each constant has one semantic meaning even when the
 * underlying value is the same — e.g. EMPTY and FIRST are both 0,
 * but separating them clarifies whether code is checking emptiness
 * or accessing an index.
 */

// Length/emptiness check: `array.length > EMPTY`, `string.length > EMPTY`.
export const EMPTY = 0;

// First element of an array: `tokens[FIRST]`.
export const FIRST = 0;

// Section level 0 uses "==" (2 equals signs), so the marker character
// count minus MARKER_OFFSET gives the section level.
export const MARKER_OFFSET = 1;

// Last element: array.at(LAST_ELEMENT)
export const LAST_ELEMENT = -1;

// Offset to the next element in a sequential scan.
export const NEXT = 1;

// Two adjacent nodes that form a logical pair (e.g. an attribute
// list followed by the block it annotates).
export const PAIR_LENGTH = 2;

// AsciiDoc delimited blocks require at least 4 delimiter characters
// (e.g. `----`, `....`, `++++`).
export const MIN_DELIMITER_LENGTH = 4;

// Chevrotain's LA(k) uses 1-based lookahead: LA(1) is the
// next token. Used in GATE functions to check what comes next.
export const LOOKAHEAD = 1;

// When a delimited block's content contains a line that looks
// like a delimiter, the output delimiter must be this many
// characters longer than the conflicting line to avoid
// ambiguity on re-parse.
export const SAFE_DELIMITER_PAD = 1;
