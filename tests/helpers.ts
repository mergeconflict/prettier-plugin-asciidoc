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
import type { ListNode } from "../src/ast.js";
import type { parse } from "../src/parser.js";
import plugin from "../src/index.js";

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

// Helper to extract the first list block from parsed children,
// throwing if the first child is not a list. Avoids repetitive
// type guards and satisfies the prefer-destructuring lint rule.
export function firstList(
  children: ReturnType<typeof parse>["children"],
): ListNode {
  const [block] = children;
  if (block.type !== "list") {
    throw new Error("Expected list");
  }
  return block;
}
