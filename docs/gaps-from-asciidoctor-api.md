# Gaps found from Asciidoctor API audit

Audit date: 2026-02-22. Compared the complete Asciidoctor Ruby document
model (node classes, block contexts, inline contexts, subtypes) against
our implementation status and the plan in
`docs/plans/2026-02-20-prettier-plugin-asciidoc.md`.

Source: the Asciidoctor Ruby source at
[github.com/asciidoctor/asciidoctor](https://github.com/asciidoctor/asciidoctor),
specifically the three built-in converters (HTML5, DocBook5, ManPage)
which each implement a `convert_*` method for every possible node
context.

## Block contexts (29 in Asciidoctor)

| Context               | Status                                        | Plan task |
| --------------------- | --------------------------------------------- | --------- |
| `document`            | Done                                          | —         |
| `section`             | Done                                          | —         |
| `preamble`            | Implicit (no dedicated node, not needed)      | —         |
| `floating_title`      | Done (discreteHeading)                        | —         |
| `paragraph`           | Done                                          | —         |
| `listing`             | Done (delimitedBlock)                         | —         |
| `literal`             | Done (delimitedBlock)                         | —         |
| `pass`                | Done (delimitedBlock)                         | —         |
| `example`             | Done (parentBlock)                            | —         |
| `quote`               | Done (parentBlock)                            | —         |
| `sidebar`             | Done (parentBlock)                            | —         |
| `open`                | Done (parentBlock)                            | —         |
| `ulist`               | Done                                          | —         |
| `olist`               | Done                                          | —         |
| `colist`              | Done                                          | —         |
| `admonition`          | Done (paragraph-form)                         | Task 13b  |
| `comment`             | Done                                          | —         |
| `thematic_break`      | Done                                          | —         |
| `page_break`          | Done                                          | —         |
| `table`               | Not done                                      | Task 18   |
| `dlist`               | Not done                                      | Task 17   |
| `image` (block macro) | Not done                                      | Task 19   |
| `video` (block macro) | Not done                                      | Task 19   |
| `audio` (block macro) | Not done                                      | Task 19   |
| `toc` (block macro)   | Not done                                      | Task 19   |
| `stem`                | **Not done, NOT IN PLAN**                     | —         |
| `verse` (delimited)   | **Partial, NOT IN PLAN**                      | —         |
| `fenced_code`         | **Not done, NOT IN PLAN**                     | —         |
| `embedded`            | N/A (pseudo-context for headerless rendering) | —         |

## Inline contexts (10 contexts, 35 subtypes in Asciidoctor)

| Context            | Subtypes                           | Plan task | Gap?            |
| ------------------ | ---------------------------------- | --------- | --------------- |
| `inline_quoted`    | strong, emphasis, monospaced, mark | Task 14   | —               |
| `inline_quoted`    | superscript, subscript             | Task 24   | —               |
| `inline_quoted`    | double, single (curly quotes)      | Task 24   | —               |
| `inline_quoted`    | asciimath, latexmath               | —         | **Not in plan** |
| `inline_quoted`    | unquoted (bare role/id)            | —         | Edge case       |
| `inline_anchor`    | link, xref, ref, bibref            | Task 15   | —               |
| `inline_image`     | default                            | Task 16   | —               |
| `inline_image`     | icon (`icon:name[]`)               | —         | **Not in plan** |
| `inline_footnote`  | definition, xref                   | Task 16   | —               |
| `inline_indexterm` | hidden, visible                    | Task 24b  | —               |
| `inline_kbd`       | —                                  | Task 16   | —               |
| `inline_button`    | —                                  | Task 16   | —               |
| `inline_menu`      | —                                  | Task 16   | —               |
| `inline_callout`   | —                                  | —         | **Not in plan** |
| `inline_break`     | —                                  | Task 16   | —               |

## Relevance to a Prettier plugin

Not everything in Asciidoctor's model matters for a source formatter.
A Prettier plugin parses source text, builds an AST, and prints it
back — it does not resolve references, expand attributes, apply
substitutions, or convert to HTML. This section classifies each gap by
whether it affects formatting correctness.

### Actionable gaps (would cause incorrect formatting)

**Block masquerading** is the most important gap. Style attributes on
delimited blocks change the block's effective content model. If `[verse]`
precedes `____`, the content is verbatim lines that must not be reflowed.
If we treat it as a compound quote block, we would parse inner lines as
paragraphs and reflow them — mangling the output. The same applies to
`[source]` on open blocks, `[stem]` on `++++`/`____`, and `[NOTE]` on
`====`. This subsumes the `verse` and `stem` block gaps.

**Fenced code blocks** (` ``` `) would be parsed as paragraphs and
reflowed if unrecognized — real breakage. Found in the RFD corpus
(RFD 0301).

The full masquerade table from the Asciidoctor converter:

| Delimiter        | Default context | Masquerade styles                                                                                        |
| ---------------- | --------------- | -------------------------------------------------------------------------------------------------------- |
| `--` (open)      | open            | comment, example, literal, listing, pass, quote, sidebar, source, verse, admonition, abstract, partintro |
| `----` (listing) | listing         | literal, source                                                                                          |
| `....` (literal) | literal         | listing, source                                                                                          |
| `====` (example) | example         | admonition                                                                                               |
| `____` (quote)   | quote           | verse                                                                                                    |
| `++++` (pass)    | pass            | stem, latexmath, asciimath                                                                               |

### Already covered by existing plan tasks

These gaps are not separate features — they are details within existing
planned tasks and will be handled when those tasks are implemented:

- **`[[id, reftext]]`** — detail of anchor parsing (Task 12 area)
- **Inline math** (`asciimath`, `latexmath`) — just more `inline_quoted`
  subtypes; handled by the same mechanism as Tasks 14/24
- **`icon:[]`** — just another inline macro with the same `name:target[attrs]`
  syntax as `image:[]`, `kbd:[]`, etc. (Task 16)
- **`inline_callout`** — lives inside verbatim blocks that we preserve
  as-is; no action needed unless we start parsing verbatim content
- **Table TSV** — trivially covered when CSV is implemented (Task 18)
- **Attribute references in text** — `{name}` is inline text that passes
  through as-is; no special handling needed for formatting

### Not relevant to a formatter

These are semantic, runtime, or rendering concerns that do not affect
source formatting:

- **Section names** (chapter, appendix, bibliography, etc.) — semantic
  classification via `[appendix]` etc. attributes, same source syntax
  as any block attribute
- **Document types** (article, book, manpage, inline) — affects
  Asciidoctor rendering, not source syntax
- **Substitutions** — Asciidoctor's output-time processing pipeline;
  the formatter works on source text before substitutions
- **Text replacements** (`(C)`, `--`, `...`, arrows) — literal source
  characters that pass through unchanged
- **Safe modes** — runtime security setting
- **Extension processors** — runtime plugins, not source syntax
- **Content models** — implementation detail of how we handle each block
  type, not a gap

## Asciidoctor model reference

For completeness, here is the full node taxonomy derived from the
Asciidoctor Ruby source.

### Node class hierarchy

```
AbstractNode
  AbstractBlock
    Document
    Section
    Block
    List
    ListItem
    Table
      Table::Column
      Table::Cell
  Inline
```

### Content models

| Model    | Meaning                                 |
| -------- | --------------------------------------- |
| compound | Contains child blocks                   |
| simple   | Contains inline text with substitutions |
| verbatim | Contains preformatted text              |
| raw      | Contains raw text (no processing)       |
| empty    | Contains no content                     |

### Inline quoted subtypes (QUOTE_TAGS)

strong, emphasis, monospaced, mark, superscript, subscript, double,
single, asciimath, latexmath, unquoted.

### Inline anchor subtypes

xref, ref, bibref, link.

### Section names

section, chapter, part, appendix, abstract, preface, dedication,
acknowledgments, colophon, bibliography, glossary, index, partintro,
synopsis.

### Admonition types

NOTE, TIP, IMPORTANT, WARNING, CAUTION.

### Substitution types

specialcharacters, quotes, attributes, replacements, macros,
post_replacements, callouts.

### Text replacements

`(C)`, `(R)`, `(TM)`, `--` (em-dash), `...` (ellipsis), `->`, `=>`,
`<-`, `<=`.

### Table cell styles

asciidoc, literal, header, emphasis, monospaced, strong.

### Table formats

psv (pipe), dsv (colon), csv (comma), tsv (tab).

### Document types

article (default), book, manpage, inline.
