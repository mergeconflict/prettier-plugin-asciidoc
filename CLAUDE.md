# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Prettier plugin for formatting AsciiDoc (.adoc) files. Custom source-preserving parser produces an AST with character offsets, printer converts it to Prettier Doc IR. See `docs/design.md` for the full design and `docs/plans/` for the implementation plan.

## Commands

```bash
npm run check          # TypeScript type checking (tsc --noEmit)
npm run lint           # ESLint, zero warnings policy (--max-warnings=0)
npm test               # Vitest
npm run build          # tsup → dist/ (ESM + DTS)
npm run vendor         # Re-fetch ASG schema + TCK fixtures into vendor/
npx vitest run tests/parser/reader.test.ts  # Run a single test file
```

All four checks (check, lint, test, build) must pass before considering work done.

## Architecture

```
source text → Lexer → Parser → CST → AST Builder → AST → Printer → formatted output
                                                           ↓
                                                      toASG() → TCK validation (test-time only)
```

- **Parser** (`src/parser.ts`, `src/parse/`): Built with Chevrotain. Three phases: lexer (tokens), parser (CST), AST builder (visitor). NOT Asciidoctor.js — see "Why not Asciidoctor.js?" and "Why Chevrotain?" in `docs/design.md`.
- **AST** (`src/ast.ts`): Designed for Prettier, not the AsciiDoc ASG. Preserves comments, directives, attribute entries, and other constructs the ASG intentionally discards.
- **Printer** (`src/printer.ts`): Walks AST, produces Prettier Doc IR.
- **TCK validation** (`tests/tck/`): `toASG()` converts our AST to official ASG format for test-time conformance checks. Dev-only, not shipped.
- **Vendored deps** (`vendor/`): ASG schema and TCK test fixtures from the asciidoc-lang project. Updated via `npm run vendor`.

## Lint rules to know about

ESLint is strict. Key rules that affect how you write code:
- No `any` — use proper types
- No `null` — use `undefined` (relaxed in test files)
- `strict-boolean-expressions` — no truthy/falsy checks, be explicit
- No magic numbers (relaxed in test files)
- No `console.log`
- Unused vars must be prefixed with `_`
- Unicorn recommended rules (modern JS conventions)

## Code comments

All non-trivial code should have comments that explain *why* it exists, not just what it does. Restate the code's purpose only when the intent isn't obvious from reading it.

**Style convention:**
- `/** */` JSDoc — exported/public API surfaces (interfaces, exported types, module-level file docs). VS Code shows these on hover.
- `//` — internal implementation notes (helper functions, grammar rules, token definitions, "why" explanations).

**Line width:** Keep comments within 80 columns. Prettier doesn't reflow comments, so wrap them manually.

## AsciiDoc reference

`docs/asciidoc-format.md` has a comprehensive syntax reference covering all constructs the parser needs to handle, including the ASG node types and what the ASG does NOT represent (which our AST must).

## Version control

This project uses jj (Jujutsu), not git:
- `jj st` — status
- `jj diff --git` — show changes
- `jj describe -m "message"` — set commit message
- `jj new` — create new change
- `jj log` — history
