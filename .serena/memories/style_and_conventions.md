# Style and Conventions

## TypeScript

- Strict mode enabled
- ES2024 target, ES2022 module, bundler module resolution
- No explicit `any` — use proper types
- No floating promises
- Strict boolean expressions
- No unnecessary conditions
- No magic numbers (relaxed in test files)
- Unused vars must be prefixed with `_`
- No console.log (use proper error handling)
- No null (use undefined) — relaxed in test files

## Linting

ESLint 9 with:
- typescript-eslint strict + stylistic type-checked
- eslint-config-love
- eslint-plugin-unicorn recommended
- Zero warnings policy (`--max-warnings=0`)

## Writing Style

- Never use the phrase "key insight"
- "upfront" is two words ("up front"), not one

## General

- DRY, YAGNI principles
- Prefer editing existing files over creating new ones
- ESM throughout (no CommonJS)
