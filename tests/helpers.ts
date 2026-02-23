/**
 * Shared test utilities for parser and format tests.
 *
 * Format tests import the plugin object directly from source (via vitest's
 * TS handling) rather than from dist/. This avoids needing a build step
 * before running tests — only the identity.test.ts smoke tests use dist/.
 *
 * NOTE: `identity.test.ts` intentionally does NOT use this helper. It has
 * its own `formatAdoc` that imports from the built `dist/` output, so it
 * validates that the build artifact works end-to-end. Do not refactor
 * identity.test.ts to use this shared helper — that would defeat its purpose.
 */
import { format } from "prettier";
import type {
  BlockNode,
  DelimitedBlockNode,
  ListNode,
  ParagraphNode,
} from "../src/ast.js";
import type { parse } from "../src/parser.js";
import plugin from "../src/index.js";
import { narrow } from "../src/unreachable.js";

/**
 * Formats AsciiDoc input through Prettier with optional overrides.
 * Shared test helper that avoids duplicating plugin configuration
 * in every test file.
 * @param input - raw AsciiDoc source text
 * @param options - optional Prettier overrides; the asciidoc parser
 *   and plugin are always injected regardless of what is passed here
 * @param options.printWidth - line width limit for the formatter
 * @returns the formatted output string; Prettier always appends a
 *   trailing newline, so callers can rely on that invariant
 */
export async function formatAdoc(
  input: string,
  options?: { printWidth?: number },
): Promise<string> {
  return await format(input, {
    parser: "asciidoc",
    plugins: [plugin],
    ...options,
  });
}

/**
 * Narrows the first child of a document's children array to
 * ListNode. Using an explicit throw rather than a cast means
 * test setup errors surface immediately with a readable message
 * instead of a silent type lie.
 * @param children - the children array from a `parse()` result
 * @returns the first child, narrowed to ListNode
 */
export function firstList(
  children: ReturnType<typeof parse>["children"],
): ListNode {
  const [block] = children;
  narrow(block, "list");
  return block;
}

/**
 * Narrows a BlockNode to ParagraphNode. Using an explicit
 * throw rather than a cast means test setup errors surface
 * immediately with a readable message instead of a silent
 * type lie.
 * @param node - block node expected to be a paragraph
 * @returns the node narrowed to ParagraphNode
 */
export function asParagraph(node: BlockNode): ParagraphNode {
  narrow(node, "paragraph");
  return node;
}

/**
 * Narrows the first child of a document's children array to
 * DelimitedBlockNode. Using an explicit throw rather than a
 * cast means test setup errors surface immediately with a
 * readable message instead of a silent type lie.
 * @param children - the children array from a `parse()` result
 * @returns the first child narrowed to DelimitedBlockNode
 */
export function firstDelimitedBlock(
  children: ReturnType<typeof parse>["children"],
): DelimitedBlockNode {
  const [block] = children;
  narrow(block, "delimitedBlock");
  return block;
}
