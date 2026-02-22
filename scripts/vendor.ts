#!/usr/bin/env bun
/* eslint-disable no-console -- runner script */

/**
 * Fetches vendored dependencies from the AsciiDoc project:
 * - ASG schema from asciidoc-lang
 * - TCK test fixtures from asciidoc-tck
 *
 * Usage: bun scripts/vendor.ts
 */

import { $ } from "bun";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const tempdir = await mkdtemp(path.join(tmpdir(), "asciidoc-vendor-"));

try {
  console.log("Cloning asciidoc-lang...");
  await $`git clone --depth 1 https://gitlab.eclipse.org/eclipse/asciidoc-lang/asciidoc-lang.git ${tempdir}/asciidoc-lang`;

  console.log("Cloning asciidoc-tck...");
  await $`git clone --depth 1 https://gitlab.eclipse.org/eclipse/asciidoc-lang/asciidoc-tck.git ${tempdir}/asciidoc-tck`;

  console.log("Copying ASG schema...");
  await rm("vendor/asciidoc-asg", { recursive: true, force: true });
  await $`mkdir -p vendor/asciidoc-asg`;
  await $`cp ${tempdir}/asciidoc-lang/asg/schema.json vendor/asciidoc-asg/`;
  await $`cp ${tempdir}/asciidoc-lang/asg/schema.js vendor/asciidoc-asg/`;

  console.log("Copying TCK test fixtures...");
  await rm("vendor/asciidoc-tck", { recursive: true, force: true });
  await $`mkdir -p vendor/asciidoc-tck`;
  await $`cp -r ${tempdir}/asciidoc-tck/tests vendor/asciidoc-tck/`;

  console.log("Done. Vendored files updated.");
} finally {
  await rm(tempdir, { recursive: true, force: true });
}
