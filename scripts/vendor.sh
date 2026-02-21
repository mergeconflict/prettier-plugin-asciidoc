#!/usr/bin/env bash
set -euo pipefail

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "Cloning asciidoc-lang..."
git clone --depth 1 https://gitlab.eclipse.org/eclipse/asciidoc-lang/asciidoc-lang.git "$TMPDIR/asciidoc-lang"

echo "Cloning asciidoc-tck..."
git clone --depth 1 https://gitlab.eclipse.org/eclipse/asciidoc-lang/asciidoc-tck.git "$TMPDIR/asciidoc-tck"

echo "Copying ASG schema..."
rm -rf vendor/asciidoc-asg
mkdir -p vendor/asciidoc-asg
cp "$TMPDIR/asciidoc-lang/asg/schema.json" vendor/asciidoc-asg/
cp "$TMPDIR/asciidoc-lang/asg/schema.js" vendor/asciidoc-asg/

echo "Copying TCK test fixtures..."
rm -rf vendor/asciidoc-tck
mkdir -p vendor/asciidoc-tck
cp -r "$TMPDIR/asciidoc-tck/tests" vendor/asciidoc-tck/

echo "Done. Vendored files updated."
