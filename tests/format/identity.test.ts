/**
 * Smoke tests that load the plugin from the built dist/ output.
 *
 * These are the only tests that use the compiled bundle — all other format
 * tests import the plugin object directly from source. These exist to catch
 * build/bundling regressions (e.g. missing exports, broken tree-shaking)
 * that source-level tests would miss.
 */
import { test, expect } from "vitest";
import { format } from "prettier";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const directory = path.dirname(fileURLToPath(import.meta.url));

async function formatAdoc(input: string): Promise<string> {
  return await format(input, {
    parser: "asciidoc",
    plugins: [path.join(directory, "../../dist/index.js")],
  });
}

test("formats empty file", async () => {
  const result = await formatAdoc("");
  expect(result).toBe("");
});

test("formats simple paragraph", async () => {
  const input = await readFile(
    path.join(directory, "fixtures/identity/simple.adoc"),
    "utf8",
  );
  const result = await formatAdoc(input);
  expect(result).toBe(input);
});
