# Comment Review — Flagged Items

50 agents reviewed every recently-commented file in the codebase.
Each agent fixed obvious comment issues directly and flagged items
requiring human judgment. This document collects all flagged items.

Items are grouped by category, then by file. Cross-cutting issues
that were independently flagged by multiple agents are called out
at the top.

---

## Cross-cutting issues

These were flagged independently by 2+ agents reviewing different
files:

### `EMPTY` constant semantic overload

`EMPTY = 0` is used as "zero-length collection," "first index,"
"start-of-string slice offset," and "auto-number sentinel."
Multiple agents flagged the ambiguity:

- `src/parse/inline-link-builder.ts` — used as a slice start index
- `src/parse/ast-builder.ts` — reused as callout auto-number sentinel
- `src/parse/inline-node-builder.ts` — compared against `findCloseMark`
  result instead of `NOT_FOUND`

A dedicated constant per semantic role (e.g. `FIRST = 0`,
`CALLOUT_AUTO_NUMBER = 0`) would clarify intent.

### `NOT_FOUND = -1` duplicated

Defined independently in both `src/parse/inline-link-builder.ts`
and `src/parse/inline-macro-builder.ts`. Could be extracted to
`src/constants.ts`.

### `AdmonitionNode.variant` case mismatch

`src/ast.ts` documented the variant as uppercase (`"NOTE"`, `"TIP"`,
etc.) but `src/parse/block-helpers.ts` calls `.toLowerCase()`, so
stored values are lowercase. Fixed in `ast.ts` by the ast.ts agent,
but confirmed independently by block-helpers, admonition.test.ts,
and ast.ts agents.

### `InlineNewline` vs `Newline` naming confusion

Two tokens serve similar purposes at different lexer levels:
`InlineNewline` (inline mode, pops) vs `Newline` (default mode).
Comments in `tests/parser/paragraph.test.ts` systematically used
the wrong name. The naming itself isn't wrong, but the similarity
is a recurring source of comment errors.

### `NEXT` constant semantic stretch

`length - NEXT` as "last-element index" is idiomatic but obscure.
Flagged in `src/parse/inline-tokens.ts`. Worth documenting the
convention in `src/constants.ts`.

---

## Source files — comment flags

### `src/ast.ts`

1. **MonospaceNode JSDoc exceeds 80 columns** (~94 chars, line 99).
   Backtick escaping makes line-breaking awkward. Italic span JSDoc
   (line 86) is also slightly over at 82 chars. Not fixed because
   breaking the examples hurts readability more than the width
   violation.

2. **`AdmonitionNode.variant` typed as `string`**, not a union.
   Comment documents exactly five values; a union type
   `"note" | "tip" | "important" | "caution" | "warning"` would
   strengthen type safety. May be intentional for extensibility.

3. **`src/constants.ts` MARKER_OFFSET comment** has the same
   off-by-one error that was fixed in `ast.ts` — says `==` is
   level 0, but it's level 1.

### `src/parser.ts`

No flags.

### `src/printer.ts`

4. **`MasqueradedVariant` example** describes a "directly parsed"
   verse block that doesn't currently exist in the parser.
   Hypothetical example could confuse readers.

5. **`SECOND_CHILD` comment phrasing**: "One step from the previous
   element" is strained. Consider rewording.

6. **`printListItem` checklist alignment**: Continuation lines
   align to `marker.length + 1`, but checklist items have `[x] `
   prefix (4 more chars). Continuation aligns under `[`, not under
   the text. Potential behavior gap — comment is accurate about
   what the code does, but the code may not match intent.

### `src/print-inline.ts`

7. **Pre-existing 138-char eslint-disable comment** (line 123).
   Not fixable without splitting the comment or restructuring the
   lint suppression.

8. **Function summary lists 3 node types** but the switch handles
   13 distinct case labels. Intentional high-level overview, or
   should it be expanded?

9. **Redundant `length > EMPTY` guards** before regex tests
   (lines 99–102). `.split().filter()` already handles the empty
   case. The regex would return `false` on an empty string anyway.

### `src/reflow.ts`

10. **"verbatim content" is imprecise** — `PREFIX_DELIMITER_CHARS`
    comment says "block open token + verbatim content" but `=`, `*`,
    `/` open parent/sidebar/comment blocks (not verbatim). Should
    say "block open token" without "verbatim."

11. **`>` vs `>=` in prefix check is load-bearing** —
    `word.length > MIN_DELIMITER_LENGTH` uses strict `>` because
    the `=` case (exact-length repeated chars) is caught by
    `isRepeatedChar` above. This interaction is non-obvious and
    undocumented.

12. **`\u002D` in regex** — unusual way to write a hyphen in a
    character class. A literal `-` at end of class or `\-` would
    be clearer.

13. **`const [first] = word` destructuring** — may produce
    `string | undefined` depending on tsconfig strict indexed
    access settings. Worth verifying with `bun run check`.

### `src/serialize-inline.ts`

14. **`isMailto` via string inspection**: AST collapses `link:` and
    `mailto:` into `"macro"` form, so mailto is detected by
    inspecting target at serialization time. If `LinkNode.form`
    were ever extended to distinguish `"mailto"`, this branch
    would become dead code silently.

### `src/unreachable.ts`

No flags.

### `src/constants.ts`

See cross-cutting issues (EMPTY, NEXT, MARKER_OFFSET).

---

## Source files — `src/parse/` flags

### `src/parse/ast-builder.ts`

15. **`EMPTY` as auto-number sentinel** in `calloutListItem`:
    `EMPTY = 0` means "zero-length collection" but is reused as
    auto-number sentinel for `<.>`. A dedicated
    `CALLOUT_AUTO_NUMBER = 0` would be clearer.

16. **`block` fallback `@returns`** says "zero-width paragraph"
    but the position is actually document-start-to-end (full span).
    Not zero-width at all — the description is misleading.

17. **`block` JSDoc `@returns` and actual fallback position** are
    inconsistent (same issue as above, different angle).

### `src/parse/block-helpers.ts`

18. **`@param openTokens`** in `buildDelimitedBlock` /
    `buildParentBlock` conflates caller context with an internal
    invariant ("always present since the grammar requires it").
    The invariant is better as an inline comment on the
    `unreachable()` call. Minor style concern.

19. **`findSubrule` priority order** — says "checked in priority
    order: comments, attribute entries, lists, delimited blocks,
    then paragraphs" but doesn't explain why that order (comments
    and attribute entries are syntactically unambiguous; paragraphs
    come last because they'd shadow other constructs).

### `src/parse/continuation-builder.ts`

20. **`inlineNewlineTokens` naming** suggests "newlines that are
    inline" but actually means "newlines from inline-mode lexer."
    `inlineModeNewlineTokens` would be more precise.

21. **`mergeSortedTokens` called 3 times across two files** — the
    layering is non-obvious. Would benefit from comment work in
    `inline-tokens.ts`.

22. **Shallow copy pattern** (`...t` spread + override): Safe
    because Chevrotain tokens are value objects, but worth a brief
    note explaining why a shallow copy is sufficient.

### `src/parse/cst-types.ts`

23. **`BlockCstChildren` has 20 fields** (one per grammar
    alternative) — could benefit from a brief "at most one is
    populated per CstNode" note.

24. **List item `Newline` fields**: "structural" is doing a lot of
    work without explanation.

### `src/parse/delimiter-patterns.ts`

25. **`findLast` vs depth-counting loop asymmetry**:
    `makeClosePattern` uses simple `findLast` while
    `makeParentClosePattern` does depth tracking. No comment
    explains why `findLast` is sufficient (non-nestable blocks
    can't appear inside themselves). Worth a one-liner.

26. **Inconsistent eslint-disable suffixes**: "Chevrotain requires
    null for no-match" vs "Chevrotain requires null" across the
    two functions.

### `src/parse/discrete-heading.ts`

27. **`isDiscreteAttribute` check order**: The guard checks
    `next.type === "section"` before calling `isDiscreteAttribute`.
    Reversing the order would short-circuit on a cheap string
    comparison. Micro-optimization not worth changing, but noted.

### `src/parse/inline-link-builder.ts`

28. **`EMPTY` used as a slice start index**: `EMPTY = 0` conveys
    "zero-length" but is used as start-of-string index. `FIRST = 0`
    would fit better semantically. Appears project-wide.

29. **`splitAtBracket` no assertion on malformed input**: Assumes
    `]` at end of string. If malformed, silently truncates last
    char. Grammar guarantees this, but no assertion documents or
    enforces the precondition.

30. **`makeLinkFromMacro` JSDoc says "preserved"**: Inaccurate —
    scheme is stripped and reconstructed, not preserved verbatim.
    "Stored as" would be more precise. (May have been fixed by the
    agent — verify.)

### `src/parse/inline-macro-builder.ts`

31. **`splitAtBracket` and `positionOf` use `/** \*/`** instead of
`//`for unexported helpers. Convention says`//`for internals.
But`inline-link-builder.ts` mirrors the same pattern, so it's
    consistent cross-file. Decide on one convention and apply it.

### `src/parse/inline-mark-pattern.ts`

32. **`INLINE_BOUNDARY_PUNCTUATION` comment** still uses "word
    boundary" (informal) rather than "constrained formatting
    boundary" (spec term).

33. **`+` in the punctuation set** has no corresponding `PlusMark`
    token built with `makeInlineMarkPattern` — may be intentional
    (passthrough uses a different mechanism) but worth confirming.

### `src/parse/inline-node-builder.ts`

34. **`lookupMarkType` is vestigial** — one caller
    (`makeFormattingNode`), pure pass-through wrapper over
    `MARK_TO_TYPE.get()`. The indirection doesn't reduce coupling.
    Consider inlining.

35. **`dispatchPairedToken` is a thin gate** — two-line body, one
    call site. The naming benefit is real; whether it justifies the
    indirection is a judgment call.

36. **`handleRoleAttribute` parameter bag**: 5 of 6
    `RoleAttributeContext` fields are already in scope in the main
    loop. The extraction reduces cognitive load but the parameter
    bag pattern is unusual. Current `//` comment explains it well.

### `src/parse/inline-tokens.ts`

37. **`NEXT` semantic overload**: `length - NEXT` as "last-element
    index" is idiomatic but a semantic stretch. (See cross-cutting
    issues.)

38. **Duplicate `@returns`** between `inlineLinesToTextTokens` and
    `inlineCstToTextTokens` — maintenance hazard, but `@returns`
    is required on every export by lint rules.

39. **"OR rule" unexplained**: "CstNodes from the `inlineToken` OR
    rule" — Chevrotain-specific jargon with no parenthetical for
    non-Chevrotain readers.

### `src/parse/list-builder.ts`

40. **ESLint suppression comments exceed 80 columns** (~103 chars)
    but can't be split (directive must be on one line). Consider
    eliminating the `!` assertions structurally instead.

41. **`buildListItemNode` `@param item`** could note it's only
    called from `nestListItems`.

42. **`nestListItems` `FIRST` comment** doesn't address whether
    items starting at depth > 1 is valid input.

### `src/parse/paragraph-form.ts`

43. **`VERBATIM_MASQUERADES` two-level map**: Comment explains
    structure but not why it's two-level (valid masquerade styles
    differ per parent block variant).

44. **`openEnd < FIRST` guard** in `extractParentBlockContent`:
    Returns `""` silently — but is this branch even reachable given
    the grammar's invariants? Might warrant `unreachable()`.

45. **`AdmonitionNode` `content: undefined`**: No local comment
    explaining what `content` vs `children` means for this branch.

### `src/parse/positions.ts`

46. **`endLine` is not adjusted by `ONE_PAST_END`** (unlike
    offset/column) — correct but asymmetric and uncommented. Worth
    a brief inline note explaining why lines don't need the
    adjustment.

47. **`computeEnd` uses `FIRST_COLUMN` (= 1)** as an addend for
    exclusive-end calculation. Works numerically but semantically
    confusing — `ONE_PAST_END` would be more self-documenting.

### `src/parse/section-builder.ts`

No flags.

### `src/parse/token-builders.ts`

48. **Negated constant as slice index**:
    `-BLOCK_ATTR_LIST_SUFFIX_LEN` evaluates to `-1`. Idiomatic
    for "drop the last character" but the negation is implicit.
    `token.image.length - SUFFIX_LEN` would be more readable if
    ever extended.

49. **`buildThematicBreak` / `buildPageBreak` JSDoc** don't
    mention their delimiter syntax (`'''` / `<<<`). Type names are
    self-documenting, but noting the delimiter in `@param` would
    eliminate a cross-reference.

---

## Test files — comment flags

### `tests/helpers.ts`

50. **`firstList`'s throw message** doesn't include the actual type
    (`${node.type}`) unlike `asParagraph` and
    `firstDelimitedBlock` — implementation inconsistency.

51. **Module-level NOTE** about `identity.test.ts` having its own
    `formatAdoc` is accurate now, but could become misleading if
    that helper diverges.

### `tests/fuzz/config.ts`

No flags.

### `tests/format/identity.test.ts`

52. **Pre-existing lint error** on `const directory` —
    `jsdoc/require-jsdoc` triggers on module-level constants.
    Test-file lint relaxations may be incomplete.

53. **Only two test cases** for identity. If meant to be
    comprehensive identity coverage (not just dist/ smoke), it's
    thin.

### `tests/format/inline-formatting.test.ts`

54. **`src/print-inline.ts` corruption noted** by this agent, but
    the dedicated `print-inline.ts` agent found no corruption.
    Likely a transient working-tree state. Discard this flag if
    `print-inline.ts` looks clean.

### `tests/parser/admonition.test.ts`

55. **Multi-line paragraph-form admonition test**: No comment
    explaining AsciiDoc continuation-line joining mechanism.

56. **Position tracking test**: Only tests start position, not end.
    No comment on whether the omission is intentional.

### `tests/parser/attribute-entry.test.ts`

57. **No test for explicit empty-string value** — the "no value vs
    empty string" comment establishes a contract boundary but no
    test exercises the edge. Worth noting whether AsciiDoc even
    allows an explicit empty-string value (`:key: ` with trailing
    space trimmed to `""`).

58. **Minor verb inconsistency**: prefix/suffix tests use
    "reconstruct" vs "reproduce" — may be intentional style
    variation.

### `tests/parser/block-attributes.test.ts`

59. **Describe block "standalone anchor parsing"** contains a
    non-standalone test ("anchor before text forms one paragraph").
    Name is slightly misleading.

60. **Pre-existing test failures** from `BLOCK_TITLE_PREFIX_LEN`
    not being defined — unrelated to comment changes.

### `tests/parser/block-masquerade.test.ts`

61. **Verse attribution test** uses
    `[verse, Carl Sandburg, Fog]` but doesn't assert attribution
    is preserved anywhere in AST — `DelimitedBlockNode` has no
    attribution field. Worth knowing if attribution round-tripping
    becomes a requirement.

### `tests/parser/comment.test.ts`

No flags.

### `tests/parser/delimited-block.test.ts`

62. **Listing block `describe` has no suite-level comment**:
    Individual tests are good but there's no framing for what they
    share (verbatim content, closed by same-length delimiter, lexer
    mode switch).

63. **`form` field never asserted**: Every test constructs
    delimited-form blocks but none asserts `form === "delimited"`.

64. **End position not tested**: Other parser tests assert
    `position.end.offset` but this suite doesn't. If end-position
    matters for range formatting, it's a gap.

### `tests/parser/discrete-heading.test.ts`

65. **Line 16 is 84 chars** (over 80-col limit) — code line, not
    comment, but worth noting.

66. **Missing test**: `[discrete]` not followed by a heading (e.g.
    followed by a paragraph). The conversion should be a no-op in
    that case, but it's not covered.

### `tests/parser/document-header.test.ts`

67. **"Printer's join logic"** is vague — doesn't map to any
    function or concept name. Worth naming the mechanism.

68. **"Attribute entries belong to the header"** implies AST
    grouping, but they're flat siblings. Could mislead readers
    about AST structure.

69. **"Must not be confused with section headings"** doesn't
    explain why the disambiguation works (the `(?!=)` lookahead
    and token priority).

### `tests/parser/fenced-code.test.ts`

70. **Empty fenced block test** doesn't assert `language` is
    `undefined` — coverage gap.

71. **Leading whitespace in language hints** untested.

### `tests/parser/inline-formatting.test.ts`

72. **Ambiguous pairing behavior** in `\**` backslash test: the
    exact mechanism (constrained/unconstrained mismatch vs
    `BackslashEscape` token disruption) is implementation-internal.
    Anyone hardening this test should first read
    `inline-mark-pattern.ts` and `inline-node-builder.ts`.

73. **Missing comment on `\_` escape test** (line 155): No comment
    unlike the `\*` and `\**` variants. Minor inconsistency.

### `tests/parser/inline-links.test.ts`

74. **Mailto empty-brackets test** doesn't assert `form`:
    Inconsistent with `link:` and `xref:` empty-bracket tests
    which both assert `form === "macro"`.

75. **`_textChild` naming** uses underscore prefix (unused-variable
    convention) but the variable IS used in an assertion on the
    next line. Misleading.

### `tests/parser/literal-paragraph.test.ts`

76. **Describe label** "literal paragraph parsing" covers both
    indented and delimited forms, but the name only says "literal
    paragraph." Slightly misleading.

77. **Position test** only asserts start, not end.

78. **Delimited literal test** doesn't assert content (covered
    elsewhere, but that's unstated).

### `tests/parser/ordered-list.test.ts`

79. **Missing "return to root after deep nesting" test** — the
    unordered-list file has it (exercises the `while` ascending
    loop running more than once). Ordered list has no equivalent.

80. **Mixed `unreachable()` vs `throw new Error()`** — appears
    intentional and consistent with the unordered-list pattern.

### `tests/parser/paragraph.test.ts`

81. **Systemic `InlineNewline` / `Newline` naming confusion** —
    all five fixes in this file corrected the same token-name
    error. The naming similarity is a documentation hazard; worth
    a note somewhere (perhaps `src/parse/cst-types.ts`) clarifying
    the two tokens and their respective lexer modes.

### `tests/parser/paragraph-form-blocks.test.ts`

82. **Missing attribution preservation assertions**: `[verse]` and
    `[quote]` tests with `Author, Source` positional attributes
    don't verify the values are preserved in the
    `blockAttributeList` node's `value` field.

83. **Missing `children[0].type` check** in `[source]` multi-line
    content test (line 78-84). `delimitedBlockAt` helper enforces
    the block type, but the attribute list node at index 0 is
    silently unchecked.

84. **Code line exceeds 80 columns** (line 202) — `parse(...)`
    call string. The 80-column rule targets comments, but flagged
    for awareness.

### `tests/parser/parent-block.test.ts`

85. **`firstParentBlock` typed to `ReturnType<typeof parse>`**
    but also called with inner `outer.children` — works at the
    type level but intent is unclear.

86. **Sidebar/quote close-must-match tests** lack the detailed
    inline comments that the example-block counterpart has.
    Explain-once principle, but asymmetric.

87. **Some tests assert `children.toHaveLength(1)`** without
    asserting the child type.

### `tests/parser/section.test.ts`

88. **Position test comment** doesn't explain what would go wrong
    if positions were incorrect (Prettier's range formatting and
    cursor tracking depend on them).

89. **"Without this grouping, the printer couldn't indent or scope
    content"** is slightly overstated.

### `tests/parser/unordered-list.test.ts`

90. **Redundant inline comment** (line 55): "The text content
    should contain both lines" — the two `toContain` assertions
    immediately below say the same thing.

91. **Thin nesting-depth comment** (line 92): "Deeper nesting:
    three levels" — says nothing about why three levels is the
    right size for this test.

92. **Missing depth-derivation pointer** for `-` marker: The
    comment notes `-` is treated as depth 1 but doesn't mention
    the mechanism (`image.length - 1`).

### `tests/tck/asg-types.ts`

93. **`AsgDiscreteHeading.level` says `(0-5)`**: The schema's
    `minimum: 0` makes this technically accurate, but verify
    whether a level-0 discrete heading is a valid real-world
    construct.

94. **`AsgHeader` missing `authors` field**: The official schema
    allows an `authors` array. Omission is covered by the
    file-level policy note, but a mention on `AsgHeader` itself
    would make the gap visible.

95. **`AsgBlock` union missing `dlist` and `blockMacro`**: The
    schema includes description lists and block macros (`audio`,
    `video`, `image`, `toc`). Covered by file-level policy note.

96. **`AsgLeafBlock.delimiter` always-required** but the schema
    only requires it when `form === "delimited"`. Current type is
    stricter than the spec. Since `convertDelimitedBlock()` always
    supplies a fallback, this never causes a runtime problem, but
    it misrepresents the spec. Consider `delimiter?: string`.

### `tests/tck/conformance.test.ts`

97. **Redundant `as unknown` cast** on `JSON.parse` return (line
    42). `JSON.parse` already returns `any`, and the return type
    annotation widens to `unknown`. The cast is noise.

98. **`block/header` grouped under "block-level" tests** but the
    document header is a header-level concept, not a body block.

### `tests/tck/to-asg-inlines.ts`

99. **`childrenToText` closure** defined fresh inside
    `inlineNodeToText` on every call. No real performance impact
    for shallow inline trees, but mildly surprising.

100. **`inlineNodeToText` is unexported** but has full `/** */`
     JSDoc with `@param` / `@returns`. The project's JSDoc
     requirement is for exported symbols. The JSDoc is valuable
     but present by choice, not by rule.

101. **`convertInlines` synthetic-node spread pattern**
     (lines 157-167): `...first` spread followed by a `position`
     override. If `Node` ever acquires additional fields, this
     could silently pass wrong data. A comment drawing attention
     to the synthetic-node pattern would be defensive.

### `tests/tck/to-asg.ts`

102. **`convertListItem` implementation gap**: The filter
     `child.type === "text"` is too narrow. It silently drops all
     structured inline nodes (bold, italic, links, etc.) before
     they reach `convertInlines`. The correct filter is
     `child.type !== "list"` to pass all `InlineNode` children
     and filter only nested `ListNode` items. This is a
     **conformance bug**, not just a comment issue.

103. **Document title location arithmetic duplicated**: `toASG()`
     re-implements the `headingTitleInlines()` marker-width formula
     inline for level 0. If the formula changes, it must be updated
     in two places.
