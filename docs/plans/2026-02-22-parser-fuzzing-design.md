# Parser Fuzzing with fast-check

Property-based testing for the AsciiDoc parser and formatter using
[fast-check](https://fast-check.dev/). Validates error recovery (Task 13d)
and catches edge cases that hand-written tests miss.

## Properties

Two properties, tested independently:

1. **Parse never throws.** For any input string, `parse(input)` returns a
   `DocumentNode` without throwing. Validates that Chevrotain's recovery
   (`recoveryEnabled: true`) and our lexer error handling produce partial
   results for all inputs.

2. **Formatting is idempotent.** For any input string,
   `format(format(input)) === format(input)`. The formatter may change the
   input on the first pass, but a second pass must be a no-op. Catches
   printer bugs where output isn't stable.

## Generator strategy: two tiers

### Tier 1 — Random bytes

`fc.string({ unit: "grapheme-composite", maxLength: 10_000 })`. Catches crashes on
genuinely unexpected input: null bytes, emoji, BOM, control characters,
multi-byte sequences. Baseline "absolute garbage doesn't crash" property.

### Tier 2 — AsciiDoc line soup

Randomly assemble lines from a vocabulary covering every token type in
`src/parse/tokens.ts`, joined with `\n`. No nesting awareness — just
lines shuffled together. This stresses:

- Token priority conflicts (e.g. `====` as example block vs heading)
- Lexer mode imbalance (open `----` or `////` without matching close
  pushes into verbatim/comment mode permanently)
- Recovery paths for unexpected token sequences
- Delimiter length matching (`makeClosePattern` logic)

**Vocabulary** (one `fc.oneof` arm per token type):

| Token                   | Generator                             |
| ----------------------- | ------------------------------------- |
| `DocumentTitle`         | `= ` + random string                  |
| `SectionMarker`         | `={2,6} Title`                        |
| `ListingBlockOpen`      | `-{4,8}`                              |
| `LiteralBlockOpen`      | `.{4,8}`                              |
| `PassBlockOpen`         | `+{4,8}`                              |
| `ExampleBlockOpen`      | `={4,8}`                              |
| `SidebarBlockOpen`      | `*{4,8}`                              |
| `QuoteBlockOpen`        | `_{4,8}`                              |
| `OpenBlockDelimiter`    | `--`                                  |
| `BlockCommentDelimiter` | `/{4,8}`                              |
| `LineComment`           | `// ` + random string                 |
| `ThematicBreak`         | `'''`                                 |
| `PageBreak`             | `<<<`                                 |
| `AttributeEntry`        | `:name: value` with random name/value |
| `BlockAnchor`           | `[[` + random string + `]]`           |
| `BlockAttributeList`    | `[` + random string + `]`             |
| `BlockTitle`            | `.` + non-space non-dot + random      |
| `AdmonitionMarker`      | `NOTE: ` / `TIP: ` / etc. + text      |
| `UnorderedListMarker`   | `*{1,5} item` or `- item`             |
| `OrderedListMarker`     | `.{1,5} item`                         |
| `CalloutListMarker`     | `<N> item` or `<.> item`              |
| `IndentedLine`          | spaces + text                         |
| Blank line              | empty string                          |
| Random text             | `fc.fullUnicodeString` (garbage)      |

Variable-length delimiters (4-8 chars) ensure the close-pattern
length-matching logic is exercised.

## File layout

```
tests/fuzz/arbitraries.ts    — shared generators (adocLine, adocDocument, randomInput)
tests/parser/fuzz.test.ts    — property: parse never throws (tiers 1 + 2)
tests/format/fuzz.test.ts    — property: formatting is idempotent (tier 2 only)
```

## Test runner config

- `numRuns: 1000` per property (configurable)
- `interruptAfterTimeLimit: 20_000` (ms) — fast-check safety net
- Vitest per-test timeout: `30_000` ms
- fast-check prints the seed on failure for reproducibility (default)
- No separate test script — runs as part of `bun test`

## Dependency

`fast-check` added as a dev dependency.

## Future extensions

- **Tier 3 (structured with corruption):** Generate well-formed AsciiDoc
  document skeletons, then apply random mutations (delete close
  delimiters, insert garbage, truncate). Targets deep nesting and recovery.
  Add when nesting-heavy tasks land (11b, 11c, 23).
- **Inline token vocabulary:** When Tasks 14-16 add inline parsing, extend
  the line-soup vocabulary with formatting marks, links, macros, etc.
- **AST-level printer fuzzing:** Generate AST nodes directly and run
  through the printer. Tests printer in isolation. Requires an arbitrary
  per node type (~200-300 lines). Defer unless printer bugs surface that
  string-based fuzzing misses.
