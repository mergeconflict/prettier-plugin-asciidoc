/**
 * Smoke tests for the identity (round-trip) property of the formatter,
 * loading the plugin from the built dist/ output.
 *
 * The identity property: formatting already-formatted input produces the
 * same output unchanged. These tests verify both that property and that
 * the compiled bundle works end-to-end. All other format tests import the
 * plugin directly from source — only these tests exercise the build
 * artifact, catching bundling regressions (e.g. missing exports, broken
 * tree-shaking) that source-level tests would miss.
 */
import { test, expect } from "vitest";
import { format } from "prettier";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

/** Fixture directory, co-located with this test file. */
const directory = path.dirname(fileURLToPath(import.meta.url));

/**
 * Formats AsciiDoc source text through Prettier using the compiled
 * dist/ plugin. Local to this file so that all identity tests exercise
 * the build artifact rather than the source — see the NOTE in
 * helpers.ts for why identity.test.ts must not use the shared helper.
 * @param input - raw AsciiDoc source, may be empty string
 * @returns the Prettier-formatted output; should equal input when
 *   input is already well-formed (the identity property)
 */
async function formatAdoc(input: string): Promise<string> {
  return await format(input, {
    parser: "asciidoc",
    plugins: [path.join(directory, "../../dist/index.js")],
  });
}

// Empty input must round-trip to empty output. Many formatters inject a
// trailing newline unconditionally; verifying the empty case ensures the
// plugin does not.
test("formats empty file", async () => {
  const result = await formatAdoc("");
  expect(result).toBe("");
});

// Fixture-based: the .adoc file is already well-formatted, so
// formatting it again must produce exactly the same bytes. The
// fixture is used (rather than an inline string) to make it easy
// to open and edit as a real AsciiDoc file during development.
// Note: simple.adoc has no trailing newline — the formatter must
// not add one.
test("formats simple paragraph", async () => {
  const input = await readFile(
    path.join(directory, "fixtures/identity/simple.adoc"),
    "utf8",
  );
  const result = await formatAdoc(input);
  expect(result).toBe(input);
});
