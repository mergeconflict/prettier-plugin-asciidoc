# prettier-plugin-asciidoc Implementation Plan

> **For Claude:** Required sub-skills are listed below. Invoke each at the specified point — do not skip them.

### Required Sub-Skills

| Skill                                        | When to invoke                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `superpowers:subagent-driven-development`    | At session start — governs overall plan execution (dispatch fresh subagent per task, two-stage review) |
| `superpowers:test-driven-development`        | At the start of every implementation task (Tasks 1-29)                                                 |
| `superpowers:verification-before-completion` | Before every commit step — run checks, confirm output                                                  |
| `superpowers:systematic-debugging`           | When any test fails unexpectedly — do not guess at fixes                                               |
| `superpowers:requesting-code-review`         | After completing milestone groups (see below)                                                          |

### Milestones (request code review after each)

1. **Setup** — after Task 1 (vendor + skeleton)
2. **Core block parsing** — after Task 7 (paragraphs, sections, comments, attributes, document header)
3. **Lists** — after Task 9c (unordered, ordered, checklists, callouts)
4. **TCK baseline** — after Task 25 (conformance harness wired up, expected failures catalogued)
5. **Delimited blocks** — after Task 11b (leaf blocks, literal paragraphs, parent blocks, block attributes/titles, paragraph-form blocks, discrete headings, breaks, indented list continuation fix, admonitions, fenced code blocks, delimiter length matching, block masquerading)
6. **Inline parsing** — after Task 16
7. **Remaining block types** — after Task 21 (description lists, tables, macros, includes, conditionals)
8. **Polish** — after Task 29 (list continuation, charrefs, index terms, integration tests, options, underline headings, explicit ordered markers)

### Parallelizable task groups

No tasks can run in parallel unless we're certain they will not touch the same files or logical areas.

**Goal:** Build a Prettier plugin that formats AsciiDoc files with opinionated, consistent style.

**Architecture:** Chevrotain-based lexer/parser produces a CST, which a visitor converts to our Prettier-friendly AST with character offsets. Printer walks AST to produce Prettier Doc IR. A test-time `toASG()` function validates parser correctness against the official AsciiDoc TCK.

**Tech Stack:** TypeScript, Prettier 3, Chevrotain, tsup, Vitest, ESLint 9

---

## How to execute each task

1. **Invoke `superpowers:test-driven-development`** — write failing test first, always
2. Follow the steps listed in the task
3. **Invoke `superpowers:verification-before-completion`** before the commit step — run `npm run check && npm run lint && npm test && npm run build`, confirm all pass
4. Commit with `jj describe -m "message"` then `jj new`
5. If a test fails unexpectedly, **invoke `superpowers:systematic-debugging`** — do not guess

At each milestone boundary (see table above), **invoke `superpowers:requesting-code-review`**.

After every code quality review, address all of the reviewer's suggestions. Do
not defer or drop any reviewer feedback. If there is any feedback that can't
reasonably be addressed at the point when it's found (e.g. "consider doing X
when Y..."), update this plan with a note in the appropriate task to address
that feedback so it's not forgotten.

---

## Progress Checklist

- [x] Task 0: Vendor ASG schema and TCK test fixtures
- [x] Task 1: Plugin skeleton — language registration + identity parse/print
- [x] Task 2: Chevrotain lexer + parser infrastructure
- [x] Task 3: Parse paragraphs and blank lines
- [x] Task 4: Parse sections (headings)
- [x] Task 5: Parse line comments and block comments
- [x] Task 5b: Paragraph reflow (moved up from Task 22 — core formatting behavior)
- [x] Task 6: Parse attribute entries
- [x] Task 7: Parse document title and header
- [x] Task 8: Parse unordered lists
- [x] Task 9: Parse ordered lists
- [x] Task 9b: Parse checklist syntax
- [x] Task 9c: Parse callout lists
- [x] Task 10: Parse delimited leaf blocks
- [x] Task 10b: Parse literal paragraphs (indented)
- [x] Task 11: Parse delimited parent blocks
- [x] Task 12: Parse block attribute lists, anchors, and block titles
- [x] Task 12b: Parse paragraph-form blocks (verse, quote, source on paragraphs)
- [x] Task 12c: Parse discrete headings
- [x] Task 12d: Fix indented continuation lines in list items
- [x] Task 13: Parse thematic breaks and page breaks
- [x] Task 13b: Parse admonitions (paragraph-form and block-form)
- [x] Task 13d: Graceful error recovery — use Chevrotain's recovery instead of throwing
- [x] Task 25: TCK conformance test harness (moved up — TDD baseline)
- [x] Task 10c: Backtick-fenced code blocks
- [x] Task 11c: Parent block delimiter length matching
- [x] Task 11b: Block masquerading (style-driven content model)
- [x] Task 14: Inline parser — bold, italic, monospace, highlight, attribute references
- [ ] Task 14b: Inline parser hardening — test gaps, architectural improvements, token dispatch cleanup
- [ ] Task 15: Inline parser — links and cross-references
- [ ] Task 16: Inline parser — macros, passthroughs, line breaks
- [ ] Task 17: Parse description lists
- [ ] Task 18: Parse tables
- [ ] Task 19: Parse block macros
- [ ] Task 20: Parse include directives
- [ ] Task 21: Parse conditional directives
- [ ] Task 23: List continuation and complex list items
- [ ] Task 24: Superscript, subscript, and character references
- [ ] Task 24b: Index terms
- [ ] Task 26: End-to-end integration tests
- [ ] Task 27: Plugin options
- [ ] Task 28: Parse underline-style section titles
- [ ] Task 29: Parse explicit ordered list markers

Details of completed tasks have been removed from this plan.

---

## Task 14: Inline parser — bold, italic, monospace, highlight, attribute references

Parse inline formatting marks within paragraph text: `*bold*`, `_italic_`, `` `mono` ``, `#highlight#` (constrained) and their unconstrained variants `**`, `__`, ` `` `, `##`. Also parse attribute references (`{name}`) as inline tokens — these are preserved verbatim (not resolved).

**Files:**

- Create: `src/parse/inline-tokens.ts` — inline-level token definitions with **custom token patterns**, registered in a new `inline` lexer mode
- Modify: `src/parse/tokens.ts` — add `inline` mode to `multiModeDefinition`, define mode transitions (push on paragraph/list-item text start, pop on blank line/structural boundary)
- Modify: `src/parse/grammar.ts` — add inline grammar rules (`inlineContent`, `boldSpan`, `italicSpan`, etc.) to the existing parser class
- Modify: `src/ast.ts` — add inline node types
- Modify: `src/parse/ast-builder.ts`
- Modify: `src/printer.ts`
- Create: `tests/parser/inline-formatting.test.ts`
- Create: `tests/format/inline-formatting.test.ts`

**Architecture note:** See "Inline parser architecture" in `docs/design.md`. We use a unified grammar with Chevrotain lexer modes — NOT a separate parser. The existing `MultiModeLexer` already has modes for verbatim blocks; the `inline` mode extends this pattern. Block-level rules call inline rules naturally (`paragraph → MANY(inlineContent)`), producing a single CST with one coordinate space for position tracking.

**Custom token patterns** are needed for constrained vs unconstrained formatting marks. A constrained bold open (`*`) is only valid at word boundaries. The custom matcher function inspects the surrounding text at the current offset to determine whether `*` is a bold open, bold close, part of `**` unconstrained bold, or literal text.

**Step 1: Write failing tests**

- `*bold*` → bold node containing text "bold"
- `_italic_` → italic node
- `` `mono` `` → monospace node
- Mixed: `This is *bold* and _italic_` → text + bold + text + italic
- Unconstrained: `**bold**` mid-word
- Nested: `*_bold italic_*`
- Constrained vs unconstrained detection
- Backslash escapes: `\*not bold*`, `\_not italic_` — escaped marks treated as literal text (gap 14)
- Role/style attributes on inline formatting: `[red]#styled text#`, `[underline]#text#` (gap 16)
- `[.role]#text#` — dot-prefixed role attribute on mark formatting, the most common way to apply CSS classes to inline text (gap from RFD corpus audit)
- Attribute references: `{name}` → attribute reference node, preserved verbatim
- Attribute reference in paragraph: `See {project-name} for details` → text + attrRef + text
- Attribute reference as entire paragraph content: `{authors}` → paragraph containing single attrRef
- Attribute reference in header author line position: preserved without error (formerly Task 7b)
- Counter attributes: `{counter:name}` and `{counter2:name}` — recognized as attribute references, preserved verbatim

**Step 2: Implement inline token definitions**

Custom token pattern functions for each formatting mark that inspect the preceding token for word-boundary context. Group all formatting marks under a `FormattingMark` category token for convenient matching in the grammar.

**Step 3: Implement inline grammar**

- `inlineContent` rule: sequence of text and formatting spans
- `formattingSpan` rule: opening mark + inline content + closing mark
- Handle nesting via recursive rule application

**Step 4: Format tests**

- Spacing normalization around inline marks
- Constrained form preferred when at word boundaries

**Step 5: Update printer, run checks, commit**

```
jj describe -m "feat: parse and format inline bold/italic/mono/highlight/attrefs"
jj new
```

**Reflow integration (from former Task 22):** Add tests to `tests/format/reflow.test.ts` verifying that paragraph reflow preserves inline formatting across line breaks — e.g. `*bold text*` is not split across lines mid-span.

---

## Task 14b: Inline parser hardening — test gaps, architectural improvements, token dispatch cleanup

Post-implementation review of the Task 14 multi-mode inline rewrite identified several nice-to-have improvements. None are blocking, but all should be addressed before moving past Milestone 6 (inline parsing).

### Test gaps

The following edge cases lack dedicated test coverage. Add tests to `tests/parser/inline-formatting.test.ts` and `tests/format/inline-formatting.test.ts`:

**Step 1: Backslash escape before unconstrained marks**

Test `\**not bold**` — backslash before an unconstrained double mark. The `BackslashEscape` token pattern is `/\\[*_`#]/`which matches`\*`(single char after backslash). Verify that`\**text\*\*` produces text(`\*`) + text(`*text\*_`) or similar — the escape suppresses the unconstrained open but doesn't consume the second `_`.

**Step 2: Formatting spans crossing line boundaries**

Test multi-line constrained marks:

```
*bold
spanning two lines* here.
```

The inline mode pops at every `\n` via `InlineNewline`, so marks on different lines are in separate `inlineLine` CST nodes. The current `buildInlineNodes` merges tokens across lines before pairing, so this should work. Add a test to verify and prevent regression.

**Step 3: `InlineChar` fallback for stray special chars**

Test that stray `[` (not followed by `]...#`) and stray `{` (not matching `{name}`) are consumed by `InlineChar` and treated as plain text:

- `text [ more text` → single text node
- `text { more text` → single text node
- `text [not-a-role] more` → single text node (no `#` follows)

**Step 4: Empty paragraph with only formatting marks**

Test a paragraph consisting of only marks with no text content, e.g. `**\n`. The AST builder's `paragraph()` method has a `contentTokens.length > EMPTY` guard that falls back to a synthetic position — verify this path produces a valid (possibly empty-text) paragraph, not a crash.

**Step 5: Whitespace-only paragraphs inside sections**

The printer's `isWhitespaceOnlyParagraph` filtering is tested for the document level but not inside sections. Add a test:

```
== Section


Some text.
```

The whitespace-only line between heading and text should be dropped.

**Step 6: Run tests, commit**

```
bun run check && bun run lint && bun test && bun run build
jj describe -m "test: add inline parser hardening tests"
jj new
```

### Architectural improvements

**Step 7: Move whitespace-only rejection to `InlineModeStart`**

The `InlineModeStart` custom pattern currently checks `offset >= text.length || text[offset] === '\n'` to avoid firing on blank lines. It could additionally reject whitespace-only content by scanning forward to the next `\n` (or EOF) and checking for at least one non-whitespace character. This would prevent whitespace-only paragraphs from ever being created, removing the need for the `isWhitespaceOnlyParagraph` filter in the printer.

After this change, remove `isWhitespaceOnlyParagraph` and the `filterBlocks` helper from `src/printer.ts`, and remove the whitespace-only early return from `src/print-inline.ts`.

**Files:**

- Modify: `src/parse/tokens.ts` — enhance `InlineModeStart` custom pattern
- Modify: `src/printer.ts` — remove `isWhitespaceOnlyParagraph` and `filterBlocks`
- Modify: `src/print-inline.ts` — remove whitespace-only early return

**Step 8: Token type identity comparison instead of string comparison**

In `src/parse/inline-builder.ts`, the `buildFromTokens` function dispatches on `token.tokenType.name` (string comparison). This is fragile — a renamed token breaks silently. Replace with identity comparison against imported token objects:

```typescript
import { RoleAttribute, AttributeReference, InlineNewline } from "../tokens.js";
// ...
if (token.tokenType === RoleAttribute) { ... }
```

This also applies to the mark-type lookup in `lookupMarkType` and the close-mark check in `findCloseMark`. The `findCloseMark` case (comparing two unknown tokens) should stay as `tokenType.name` comparison since it compares two runtime values.

**Files:**

- Modify: `src/parse/inline-builder.ts` — import token types, replace string comparisons with identity checks

**Step 9: `flattenInlineTokens` merge instead of sort**

The `flattenInlineTokens` function uses `tokens.toSorted()` to merge inline tokens with newline tokens by offset. Both input arrays are already sorted (inline tokens from CST walk, newline tokens from grammar). Replace the sort with a linear merge of two sorted sequences for O(n) instead of O(n log n). Not urgent — only matters for very long paragraphs.

**Files:**

- Modify: `src/parse/inline-builder.ts` — replace `toSorted` with merge function

**Step 10: Run tests, commit**

```
bun run check && bun run lint && bun test && bun run build
jj describe -m "refactor: inline parser hardening — lexer-level whitespace rejection, token identity dispatch, merge sort"
jj new
```

---

## Task 15: Inline parser — links and cross-references

Parse `https://url[text]`, `link:path[text]`, `<<ref>>`, `<<ref,text>>`, `xref:doc#ref[text]`, and inline anchors `[[id]]` / `[[id,reftext]]` within paragraph text. The two-argument anchor form (`[[id, reftext]]`) sets the default cross-reference display text and is common in glossaries (seen in the Oxide RFD corpus).

**Files:**

- Modify: `src/parse/inline-tokens.ts` — add link/xref/inline-anchor tokens to `inline` lexer mode
- Modify: `src/parse/grammar.ts` — add link/xref/inline-anchor rules to the parser
- Modify: `src/ast.ts` — add `LinkNode`, `XrefNode`, `InlineAnchorNode`
- Modify: `src/parse/ast-builder.ts`
- Modify: `src/printer.ts`
- Create: `tests/parser/inline-links.test.ts`

**Commit:**

```
jj describe -m "feat: parse and format inline links and xrefs"
jj new
```

---

## Task 16: Inline parser — macros, passthroughs, line breaks

Parse `image:file[]`, `kbd:[Ctrl+S]`, `btn:[OK]`, `menu:File[Save]`, `footnote:[text]`, `footnoteref:["name","text"]`, `footnoteref:[name]`, `pass:[raw]`, `+text+`, and hard line break (`+` at end of line).

**Files:**

- Modify: `src/parse/inline-tokens.ts` — add macro/passthrough tokens to `inline` lexer mode
- Modify: `src/parse/grammar.ts` — add macro/passthrough rules to the parser
- Modify: `src/ast.ts`
- Modify: `src/parse/ast-builder.ts`
- Modify: `src/printer.ts`
- Create: `tests/parser/inline-macros.test.ts`

**Commit:**

```
jj describe -m "feat: parse and format inline macros and passthroughs"
jj new
```

**Reflow integration (from former Task 22):** Add tests to `tests/format/reflow.test.ts` verifying that hard line breaks (`+` at end of line) prevent reflow at that point — the `+` marker must act as a forced break within `fill`.

---

## Task 17: Parse description lists

Description lists: `Term:: Description` or `Term::\nDescription`.

**Files:**

- Modify: `src/ast.ts` — add `DescriptionListNode`, `DescriptionListItemNode`
- Modify: `src/parse/tokens.ts` — add `DescriptionListMarker` token
- Modify: `src/parse/grammar.ts` — add description list rules
- Modify: `src/parse/ast-builder.ts`
- Modify: `src/printer.ts`
- Create: `tests/parser/description-list.test.ts`
- Create: `tests/format/description-list.test.ts`

**Key test cases:**

- Compact form (no blank line between term and definition) preserved as-is
- Paragraph form (blank line between term and definition) preserved as-is
- Multi-line definitions
- Nested description lists
- Multiple marker depths (`::`, `:::`, `::::`)

**Commit:**

```
jj describe -m "feat: parse and format description lists"
jj new
```

---

## Task 18: Parse tables

Tables are `|===` delimited with `|` cell separators.

**Files:**

- Modify: `src/ast.ts` — add `TableNode`, `TableRowNode`, `TableCellNode`
- Modify: `src/parse/tokens.ts` — add `TableDelimiter`, `CellSeparator` tokens; consider a `table` lexer mode
- Modify: `src/parse/grammar.ts` — add table rules
- Modify: `src/parse/ast-builder.ts`
- Modify: `src/printer.ts`
- Create: `tests/parser/table.test.ts`
- Create: `tests/format/table.test.ts`

**Key test cases:**

- Simple 2x2 table
- Table with header row (`[%header]` or first row followed by blank line)
- Column specs (`[cols="1,2,3"]`)
- Cell alignment
- Table with title
- Multi-line cell content
- Footer rows: `[options="header,footer"]` (gap 11)
- CSV table: `,===` delimiter with comma-separated cells (gap 9)
- DSV table: `:===` delimiter with colon-separated cells (gap 9)
- `[format="csv"]` attribute on `|===` table (gap 9)
- Nested tables: `!===`/`!` separator inside `a`-style cells (gap 10) — stretch goal, may defer
- Full combinatorial cell prefix grammar: row span + col span + h-align + v-align + content style on a single cell (e.g., `.2+^.^h|`). Real-world RFDs freely combine all prefix components. (gap from RFD corpus audit)

**Commit:**

```
jj describe -m "feat: parse and format tables"
jj new
```

---

## Task 19: Parse block macros (image, video, audio, toc)

Block macros: `image::path[alt]`, `video::path[]`, `audio::path[]`, `toc::[]`.

**Files:**

- Modify: `src/ast.ts`
- Modify: `src/parse/tokens.ts` — add `BlockMacro` token
- Modify: `src/parse/grammar.ts`
- Modify: `src/parse/ast-builder.ts`
- Modify: `src/printer.ts`
- Create: `tests/parser/block-macro.test.ts`

**Commit:**

```
jj describe -m "feat: parse and format block macros"
jj new
```

---

## Task 20: Parse include directives

`include::path[opts]` — preserved literally (not resolved).

**Files:**

- Modify: `src/ast.ts` — add `IncludeDirectiveNode`
- Modify: `src/parse/tokens.ts` — add `IncludeDirective` token
- Modify: `src/parse/grammar.ts`
- Modify: `src/parse/ast-builder.ts`
- Modify: `src/printer.ts`
- Create: `tests/parser/include.test.ts`

**Commit:**

```
jj describe -m "feat: parse and format include directives"
jj new
```

---

## Task 21: Parse conditional directives

`ifdef::attr[]`, `ifndef::attr[]`, `ifeval::[expr]`, `endif::[]` — preserved literally.

**Files:**

- Modify: `src/ast.ts` — add `ConditionalDirectiveNode`
- Modify: `src/parse/tokens.ts` — add `ConditionalDirective` tokens (`ifdef`, `ifndef`, `ifeval`, `endif`)
- Modify: `src/parse/grammar.ts`
- Modify: `src/parse/ast-builder.ts`
- Modify: `src/printer.ts`
- Create: `tests/parser/conditional.test.ts`

**Commit:**

```
jj describe -m "feat: parse and format conditional directives"
jj new
```

---

## ~~Task 22: Paragraph reflow~~ (moved to Task 5b; inline/hardbreak extensions folded into Tasks 14 and 16)

---

## Task 23: List continuation and complex list items

List items can contain multiple blocks via the `+` continuation marker.

**Files:**

- Modify: `src/parse/tokens.ts` — add `ListContinuation` token (`+` on its own line)
- Modify: `src/parse/grammar.ts` — extend list item rules to accept continuation + nested blocks
- Modify: `src/parse/ast-builder.ts`
- Modify: `src/printer.ts`
- Create: `tests/parser/list-continuation.test.ts`
- Create: `tests/format/list-continuation.test.ts`

**Key test cases:**

- List item with `+` followed by a paragraph
- List item with `+` followed by a listing block
- Nested list with continuation

**Commit:**

```
jj describe -m "feat: parse and format list continuation"
jj new
```

---

## Task 24: Superscript, subscript, and character references

`^super^`, `~sub~`, `(C)`, `(R)`, `(TM)`, `--` (em dash), `...` (ellipsis), `->`, `=>`, and smart quote replacements (directional apostrophes/quotes) (gap 21).

**Files:**

- Modify: `src/parse/inline-tokens.ts` — add superscript/subscript/charref tokens
- Modify: `src/parse/grammar.ts`
- Modify: `src/ast.ts`
- Modify: `src/parse/ast-builder.ts`
- Modify: `src/printer.ts`
- Create: `tests/parser/inline-misc.test.ts`

**Commit:**

```
jj describe -m "feat: parse and format superscript, subscript, charrefs"
jj new
```

---

## Task 24b: Index terms

Index terms mark text for inclusion in a generated index. Two inline syntaxes plus two macro forms.

**Syntax:**

```
((visible index term))          ← visible in output, added to index
(((primary,secondary,tertiary)))  ← hidden, added to index only
indexterm:[primary,secondary]   ← macro form, hidden
indexterm2:[visible term]       ← macro form, visible
```

**Files:**

- Modify: `src/parse/inline-tokens.ts` — add index term tokens (`((`, `))`, `(((`, `)))`)
- Modify: `src/parse/grammar.ts` — add index term rules
- Modify: `src/ast.ts` — add `IndexTermNode` with `visible` flag and `terms` array
- Modify: `src/parse/ast-builder.ts`
- Modify: `src/printer.ts`
- Create: `tests/parser/index-terms.test.ts`
- Create: `tests/format/index-terms.test.ts`

**Key test cases:**

- `((visible term))` — visible index term with single entry
- `(((primary,secondary,tertiary)))` — hidden index term with up to 3 levels
- `indexterm:[primary,secondary]` — macro form (hidden)
- `indexterm2:[visible term]` — macro form (visible)
- Index terms preserved through formatting
- Index term mid-sentence

**Commit:**

```
jj describe -m "feat: parse and format index terms"
jj new
```

---

## Task 13d: Graceful error recovery

Stop throwing on lexer/parser errors. Use Chevrotain's built-in error recovery
to produce partial results and preserve unrecognized input verbatim. See "Error
handling" in `docs/design.md` for the principle.

**Current state:** `src/parser.ts` throws on the first lexer error (line 48)
and the first parser error (line 57). This means any input our grammar doesn't
understand crashes the formatter instead of degrading gracefully. We chose
Chevrotain partly for its error recovery but aren't using it.

**What to change:**

1. **Remove the lexer-error throw.** Chevrotain's lexer produces an `errors`
   array but still returns a token stream. Unrecognized characters appear as
   error entries. Convert these into a fallback token (e.g., `UnrecognizedText`)
   that the parser treats as verbatim text content.

2. **Remove the parser-error throw.** Chevrotain's parser uses four recovery
   strategies (token insertion, deletion, repetition re-sync, general re-sync)
   to produce a partial CST even when rules fail. The CST will contain
   `recoveredNode` flags. Let the AST builder handle these — recovered regions
   should pass through as raw text nodes preserving the original source.

3. **Keep AST builder assertions.** The `throw new Error(...)` calls inside
   `ast-builder.ts` and `block-helpers.ts` guard against "impossible" states
   (grammar matched a rule but expected tokens are missing). These indicate
   bugs in our grammar, not bad input. They should stay as-is.

4. **Add tests for graceful degradation.** Feed the parser input it can't
   handle and verify it produces output (even if imperfect) rather than
   throwing. Key cases:
   - Unknown block delimiter characters
   - Unclosed delimited blocks (EOF before close delimiter)
   - Malformed attribute entries
   - Input that is just plain prose (no AsciiDoc constructs)
   - Mixed recognized and unrecognized constructs in one document

**Files:**

- Modify: `src/parser.ts` — remove throws on lexer/parser errors, wire up
  fallback behavior
- Modify: `src/parse/tokens.ts` — add `UnrecognizedText` fallback token if
  needed
- Modify: `src/parse/grammar.ts` — ensure parser recovery settings are
  configured (Chevrotain's `recoveryEnabled` flag)
- Modify: `src/parse/ast-builder.ts` — handle recovered CST regions
- Create: `tests/parser/error-recovery.test.ts`
- Create: `tests/format/error-recovery.test.ts`

**Commit:**

```
jj describe -m "feat: graceful error recovery — never throw on valid AsciiDoc input"
jj new
```

---

## Task 26: End-to-end integration tests on real documents

Test the full format pipeline on realistic AsciiDoc documents.

**Files:**

- Create: `tests/format/fixtures/real-world/` — a few substantial `.adoc` files
- Create: `tests/format/real-world.test.ts`

**Key test cases:**

- Format is idempotent (formatting twice produces same output)
- A document with mixed elements (header, sections, lists, code blocks, tables, comments)
- Formatting preserves document semantics (round-trip through Asciidoctor.js produces same HTML)
- UTF-8 BOM handling — file with BOM prefix is parsed correctly, BOM stripped in output (gap 22)

**Commit:**

```
jj describe -m "feat: end-to-end integration tests"
jj new
```

---

## Task 27: Plugin options

Add plugin-specific options: `asciidocBlockDelimiterLength` (default 4), `asciidocProseWrap` (always/preserve/never).

**Files:**

- Create: `src/options.ts`
- Modify: `src/index.ts`
- Modify: `src/printer.ts`
- Create: `tests/format/options.test.ts`

**Commit:**

```
jj describe -m "feat: plugin-specific formatting options"
jj new
```

---

## Task 28: Parse underline-style section titles

Legacy two-line heading syntax where the title is on one line and underlined on the next. The formatter normalizes these to ATX-style (`== Title`).

**Syntax:**

```
Title         Level 0: =========
-----         Level 1: ---------
              Level 2: ~~~~~~~~~
              Level 3: ^^^^^^^^^
              Level 4: +++++++++
```

The underline must be within ±2 characters of the title length.

**Disambiguation with delimited blocks:**

Level-1 (`-`) and level-4 (`+`) underlines use the same characters as listing and passthrough block delimiters. A line of `----` could be either a listing block opener or a legacy heading underline. The rules that disambiguate:

1. **Blank line before the line of dashes/plusses → block delimiter.** Legacy headings require the title and underline to be contiguous (no intervening blank line). Our formatter always emits blank lines between blocks, so formatted output is never ambiguous.
2. **±2 length rule.** The underline must be within ±2 characters of the preceding line's length. A `----` (4 chars) after a 30-character paragraph line cannot be a heading underline — it's a block delimiter.
3. **No preceding text line → block delimiter.** At start-of-document or after a blank line, there is no title to underline.

Asciidoctor gives legacy headings priority over block delimiters when the ±2 rule is satisfied and no blank line intervenes. We should match that behavior: the `UnderlineHeading` token's custom pattern matcher should check the preceding (non-blank, non-newline) token's text, and only match when the length is within ±2. When it doesn't match, the line falls through to `ListingBlockOpen`/`PassBlockOpen` as normal.

**Smart minimization interaction:** The printer's smart delimiter minimization (choosing delimiter length to avoid conflicts with content) does not create ambiguity here. The formatter always separates blocks with blank lines, which rules out legacy heading interpretation. However, we should include an explicit round-trip test to verify this.

**Files:**

- Modify: `src/parse/tokens.ts` — add `UnderlineHeading` token pattern (two consecutive lines where the second is all `=`, `-`, `~`, `^`, or `+` and length matches ±2)
- Modify: `src/parse/grammar.ts` — add alternative heading rule
- Modify: `src/parse/ast-builder.ts` — produce the same `SectionNode` as ATX headings
- Modify: `src/printer.ts` — always output ATX style (normalization)
- Create: `tests/parser/underline-heading.test.ts`
- Create: `tests/format/underline-heading.test.ts`

**Key test cases:**

_Basic parsing:_

- Each underline character level (`=`, `-`, `~`, `^`, `+`) maps to the correct section level
- Underline length within ±2 of title length
- Underline too short or too long → not a heading (treated as paragraph + possibly a block delimiter)
- Formatter normalizes to ATX style in output
- Underline heading with block attributes

_Disambiguation with delimited blocks (`-` and `+` underlines):_

- `----` after text of 4 chars → legacy heading (not a listing block)
- `----` after text of 30 chars → listing block delimiter (length mismatch)
- `----` after a blank line, then text → listing block (blank line breaks contiguity)
- Same cases for `++++` vs passthrough blocks
- `~~~~` and `^^^^` underlines have no block delimiter conflicts — always unambiguous

_Round-trip / idempotency with smart minimization:_

- A listing block whose content contains `----` formats with smart-minimized `-----` delimiters, and re-parsing that output doesn't misinterpret the delimiter as a legacy heading (because the formatter emits a blank line before the block)
- Same for passthrough blocks with `++++` content

**Commit:**

```
jj describe -m "feat: parse underline-style headings, normalize to ATX"
jj new
```

---

## Task 29: Parse explicit ordered list markers

Explicit numbering styles for ordered lists beyond the implicit `.`/`..`/`...` markers. The formatter normalizes these to implicit style.

**Syntax:**

```
1. Explicit arabic
a. Lowercase alpha
A. Uppercase alpha
i) Lowercase roman
I) Uppercase roman
```

**Files:**

- Modify: `src/parse/tokens.ts` — extend `OrderedListMarker` to match explicit patterns (`\d+.`, `[a-z].`, `[A-Z].`, `[ivxlc]+)`, `[IVXLC]+)`)
- Modify: `src/parse/ast-builder.ts` — store marker style but produce the same `ListNode`
- Modify: `src/printer.ts` — normalize to implicit `.` style in output
- Create: `tests/parser/explicit-ordered-list.test.ts`
- Create: `tests/format/explicit-ordered-list.test.ts`

**Key test cases:**

- `1. Item` parsed as ordered list
- `a. Item` parsed as ordered list
- `i) Item` parsed as ordered list (note `)` instead of `.`)
- Mixed explicit and implicit markers in nested lists
- Formatter normalizes all explicit markers to implicit `.` style
- `1.` at start of a sentence in a paragraph is NOT a list marker (context sensitivity)

**Commit:**

```
jj describe -m "feat: parse explicit ordered list markers, normalize to implicit"
jj new
```
