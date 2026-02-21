# Project Overview

**prettier-plugin-asciidoc** — a Prettier plugin for formatting AsciiDoc (.adoc) files.

## Architecture

```
source text → Lexer → Parser → CST → AST Builder → AST → Printer → formatted output
                                                           ↓
                                                      toASG() → TCK validation (test-time only)
```

- Chevrotain-based parser (not Asciidoctor.js — its document model is lossy)
  - Lexer (`src/parse/tokens.ts`): tokenization with lexer modes (verbatim blocks) and custom token patterns (context-sensitive inline marks)
  - Parser (`src/parse/grammar.ts`): CstParser subclass, grammar rules with gates
  - AST Builder (`src/parse/ast-builder.ts`): CST visitor producing our Prettier-friendly AST
- AST designed for Prettier's needs: character offsets on every node, comments/directives as first-class nodes
- Printer produces Prettier Doc IR
- `toASG()` converts our AST to official AsciiDoc ASG format for test-time validation against the TCK

## Tech Stack

- Chevrotain (parser toolkit — lexer + LL(k) parser + CST)
- TypeScript (strict, ES2024 target)
- ESM modules (`"type": "module"`)
- tsup (esbuild-based build, outputs ESM + DTS)
- Vitest for testing
- ESLint 9 with typescript-eslint strict, eslint-config-love, eslint-plugin-unicorn
- prettier as peer dependency

## Key References

- Design doc: `docs/design.md`
- ASG schema: https://gitlab.eclipse.org/eclipse/asciidoc-lang/asciidoc-lang/-/tree/main/asg
- TCK tests: https://gitlab.eclipse.org/eclipse/asciidoc-lang/asciidoc-tck
- Prettier plugin API: https://prettier.io/docs/plugins#developing-plugins
