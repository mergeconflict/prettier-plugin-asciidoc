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
4. **Delimited blocks** — after Task 11b (leaf blocks, literal paragraphs, parent blocks, block attributes/titles, paragraph-form blocks, discrete headings, breaks, indented list continuation fix, admonitions, fenced code blocks, block masquerading)
5. **Inline parsing** — after Task 16
6. **Remaining block types** — after Task 21 (description lists, tables, macros, includes, conditionals)
7. **Polish** — after Task 29 (reflow, list continuation, charrefs, index terms, TCK, integration tests, options, underline headings, explicit ordered markers, attribute refs in author line)

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
- [ ] Task 7b: Attribute references in document header author line
- [ ] Task 10c: Backtick-fenced code blocks
- [ ] Task 11b: Block masquerading (style-driven content model)
- [ ] Task 14: Inline parser — bold, italic, monospace, highlight
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
- [ ] Task 25: TCK conformance test harness
- [ ] Task 26: End-to-end integration tests
- [ ] Task 27: Plugin options
- [ ] Task 28: Parse underline-style section titles
- [ ] Task 29: Parse explicit ordered list markers

---

## Tasks 0–13b: Completed

Details removed to keep context lean. See git history for implementation notes.

Tasks 22b and 22c (checklist and callout lists) were removed — they were duplicates of Tasks 9b and 9c.

---

## Task 7b: Attribute references in document header author line

The author line in a document header can use an attribute reference (`{attribute}`) instead of a literal name. The header parser must handle this without error.

**Origin:** Seen in RFDs 0250, 0400, 0499, 0567 (gap from RFD corpus audit).

**Syntax:**

```
:authors: Rain Paharia <rain@oxide.computer>

= RFD 400 Title
{authors}
```

**Files:**

- Modify: `src/parse/grammar.ts` — extend header/author-line rule to accept `{attribute}` references
- Modify: `src/parse/ast-builder.ts` — preserve the raw attribute reference text
- Modify: `src/printer.ts` — print attribute reference as-is
- Create: `tests/parser/header-attribute-ref.test.ts`

**Key test cases:**

- Author line is a single `{attribute}` reference
- Author line is a literal name (existing behavior, regression test)
- Author line with attribute reference preserves through formatting

**Commit:**

```
jj describe -m "feat: handle attribute references in header author line"
jj new
```

---

## Task 10c: Backtick-fenced code blocks

Parse Markdown-style triple-backtick fenced code blocks as an alternative to `----` listing blocks. Normalize to AsciiDoc-native `[source,lang]` + `----` in output.

**Origin:** Seen in RFD 0301 (gap from RFD corpus audit). Also identified in Asciidoctor API audit as `fenced_code` block context.

**Syntax:**

````
```rust
fn main() {
    println!("Hello, world!");
}
```
````

Equivalent to:

```
[source,rust]
----
fn main() {
    println!("Hello, world!");
}
----
```

**Files:**

- Modify: `src/parse/tokens.ts` — add `FencedCodeOpen` and `FencedCodeClose` token patterns (` ``` ` with optional language hint)
- Modify: `src/parse/grammar.ts` — add fenced code block rule, producing the same CST shape as listing blocks
- Modify: `src/parse/ast-builder.ts` — produce `listingBlock` node with language extracted from fence line
- Modify: `src/printer.ts` — always output as `[source,lang]` + `----` (normalization)
- Create: `tests/parser/fenced-code.test.ts`
- Create: `tests/format/fenced-code.test.ts`

**Key test cases:**

- ` ```rust ` with content → parsed as listing block with language "rust"
- ` ``` ` without language → listing block with no language
- Formatter normalizes to `[source,rust]` + `----`
- Fenced block with no language normalizes to bare `----` (no `[source]`)
- Content preserved exactly (verbatim)

**Commit:**

```
jj describe -m "feat: parse backtick-fenced code blocks, normalize to ----"
jj new
```

---

## Task 11b: Block masquerading (style-driven content model)

A style attribute on a delimited block changes its effective content model. This is the most important gap identified in the Asciidoctor API audit — without it, the formatter risks reflowing verbatim content or failing to parse compound content.

**Origin:** Identified in Asciidoctor API audit as the most impactful formatting-correctness gap.

The masquerade table:

| Delimiter        | Default context    | Masquerade styles                                                                                        |
| ---------------- | ------------------ | -------------------------------------------------------------------------------------------------------- |
| `--` (open)      | open (compound)    | comment, example, literal, listing, pass, quote, sidebar, source, verse, admonition, abstract, partintro |
| `----` (listing) | listing (verbatim) | literal, source                                                                                          |
| `....` (literal) | literal (verbatim) | listing, source                                                                                          |
| `====` (example) | example (compound) | admonition                                                                                               |
| `____` (quote)   | quote (compound)   | verse                                                                                                    |
| `++++` (pass)    | pass (raw)         | stem, latexmath, asciimath                                                                               |

The critical cases for formatting correctness:

- `[verse]` on `____` → verbatim (line breaks preserved, must NOT reflow)
- `[source]`/`[listing]` on `--` → verbatim (must NOT parse content as AsciiDoc)
- `[stem]` on `++++` or `____` → raw/verbatim (must NOT reflow)
- `[NOTE]`/`[TIP]`/etc. on `====` → admonition container (compound, must parse content)

**Files:**

- Modify: `src/parse/grammar.ts` — when parsing a delimited block, check the preceding `blockAttributeList` for style attributes that change content model. Route to leaf-block (verbatim) vs parent-block (compound) parsing accordingly.
- Modify: `src/parse/ast-builder.ts` — set effective block type based on masquerade style
- Modify: `src/printer.ts` — print based on effective content model
- Create: `tests/parser/block-masquerade.test.ts`
- Create: `tests/format/block-masquerade.test.ts`

**Key test cases:**

- `[verse]` + `____` → verbatim content preserved (not reflowed)
- `[source,python]` + `--` → verbatim content preserved
- `[NOTE]` + `====` → content parsed as AsciiDoc (compound)
- `[stem]` + `++++` → raw content preserved
- `[stem]` + `____` → raw content preserved (masquerade across delimiter types)
- Default behavior unchanged when no masquerade style present
- `[listing]` + `....` → verbatim (literal→listing masquerade)

**Commit:**

```
jj describe -m "feat: block masquerading — style-driven content model"
jj new
```

---

## Task 14: Inline parser — bold, italic, monospace, highlight

Parse inline formatting marks within paragraph text: `*bold*`, `_italic_`, `` `mono` ``, `#highlight#` (constrained) and their unconstrained variants `**`, `__`, ` `` `, `##`.

**Files:**

- Create: `src/parse/inline-tokens.ts` — inline-level token definitions with **custom token patterns**
- Create: `src/parse/inline-grammar.ts` — inline parser (separate from block-level grammar)
- Modify: `src/ast.ts` — add inline node types
- Modify: `src/parse/grammar.ts` — call inline parser for paragraph content
- Modify: `src/parse/ast-builder.ts`
- Modify: `src/printer.ts`
- Create: `tests/parser/inline-formatting.test.ts`
- Create: `tests/format/inline-formatting.test.ts`

**Key design note:** This is where Chevrotain's **custom token patterns** become essential. Constrained formatting marks (`*`, `_`, `` ` ``, `#`) are only valid at word boundaries. The custom token matcher function receives all previously matched tokens, so it can inspect the preceding token to determine whether the current `*` is:

- A constrained bold open (preceded by whitespace or start of text)
- A constrained bold close (followed by whitespace or end of text)
- Part of an unconstrained `**` pair (no boundary requirement)
- Literal text (none of the above)

The inline parser may use a separate lexer instance or a dedicated lexer mode, since inline tokenization has completely different rules than block-level tokenization.

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
jj describe -m "feat: parse and format inline bold/italic/mono/highlight"
jj new
```

**Reflow integration (from former Task 22):** Add tests to `tests/format/reflow.test.ts` verifying that paragraph reflow preserves inline formatting across line breaks — e.g. `*bold text*` is not split across lines mid-span.

---

## Task 15: Inline parser — links and cross-references

Parse `https://url[text]`, `link:path[text]`, `<<ref>>`, `<<ref,text>>`, `xref:doc#ref[text]`, and inline anchors `[[id]]` within paragraph text.

**Files:**

- Modify: `src/parse/inline-tokens.ts` — add link/xref/inline-anchor tokens
- Modify: `src/parse/inline-grammar.ts` — add link/xref/inline-anchor rules
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

- Modify: `src/parse/inline-tokens.ts` — add macro/passthrough tokens
- Modify: `src/parse/inline-grammar.ts` — add macro/passthrough rules
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
- Modify: `src/parse/inline-grammar.ts`
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
- Modify: `src/parse/inline-grammar.ts` — add index term rules
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

## Task 25: TCK conformance test harness

Build `toASG()` and wire up tests against the official AsciiDoc TCK expected outputs.

**Files:**

- Create: `tests/tck/to-asg.ts`
- Create: `tests/tck/conformance.test.ts`

**Step 1: Implement `toASG()`**

Converts our AST → ASG JSON:

- Strip comments, attribute entries, include/conditional directives
- Map our node types to ASG names (`paragraph` → `{name: "paragraph", type: "block"}`)
- Convert `position` to ASG `location` format (`[{line, col}, {line, col}]`)
- Inline nodes: map bold→span/strong, italic→span/emphasis, etc.

**Step 2: Write conformance tests**

- Download TCK test fixtures (or vendor them)
- For each `*-input.adoc` / `*-output.json` pair:
  - Parse the input with our parser
  - Convert to ASG with `toASG()`
  - Compare against expected output JSON

**Step 3: Fix any discrepancies found**

**Step 4: Run all checks, commit**

```
jj describe -m "feat: TCK conformance test harness"
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
