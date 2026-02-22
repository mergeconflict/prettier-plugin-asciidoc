# Parser Fuzzing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add property-based fuzz testing with fast-check to verify the parser never throws and the formatter is idempotent.

**Architecture:** Two tiers of string generators (random bytes, AsciiDoc line soup) feed into two property tests (parse-never-throws, format-idempotent). Generators live in a shared module. See `docs/plans/2026-02-22-parser-fuzzing-design.md` for the full design rationale.

**Tech Stack:** fast-check, Vitest, TypeScript

---

### Task 1: Add fast-check dependency

**Step 1: Install fast-check**

Run: `bun add -d fast-check`

**Step 2: Verify it installed**

Run: `bun run check`
Expected: PASS (no type errors)

**Step 3: Commit**

```bash
jj describe -m "chore: add fast-check dev dependency"
jj new
```

---

### Task 2: Create shared generators

**Files:**

- Create: `tests/fuzz/arbitraries.ts`

**Step 1: Write the generator module**

```ts
/**
 * fast-check arbitraries for AsciiDoc parser fuzzing.
 *
 * Two tiers of input generation:
 * - Tier 1: random Unicode strings (baseline crash testing)
 * - Tier 2: AsciiDoc "line soup" — random lines drawn from a
 *   vocabulary covering every token type in src/parse/tokens.ts
 *
 * See docs/plans/2026-02-22-parser-fuzzing-design.md for rationale.
 */
import fc from "fast-check";

// Tier 1: purely random Unicode input. Catches crashes on
// null bytes, emoji, BOM, control characters, multi-byte
// sequences — anything the lexer doesn't expect at all.
export const randomInput = fc
  .string({ unit: "grapheme-composite", maxLength: 10_000 })
  .map((s) => (s.endsWith("\n") ? s : s + "\n"));

// Tier 2: AsciiDoc-flavored line soup. Each line is drawn
// from a vocabulary that covers every token type defined in
// src/parse/tokens.ts. Lines are shuffled randomly with no
// nesting awareness — the point is to produce unexpected
// token sequences that stress recovery paths.

// prettier-ignore
const adocLine = fc.oneof(
  // DocumentTitle: `= Title`
  fc.string({ minLength: 1, maxLength: 40 })
    .map((s) => `= ${s}`),

  // SectionMarker: `={2,6} Title`
  fc.integer({ min: 2, max: 6 })
    .map((n) => "=".repeat(n) + " Title"),

  // Leaf block open delimiters (push into verbatim modes)
  fc.integer({ min: 4, max: 8 }).map((n) => "-".repeat(n)),
  fc.integer({ min: 4, max: 8 }).map((n) => ".".repeat(n)),
  fc.integer({ min: 4, max: 8 }).map((n) => "+".repeat(n)),

  // Parent block delimiters (stay in default mode)
  fc.integer({ min: 4, max: 8 }).map((n) => "=".repeat(n)),
  fc.integer({ min: 4, max: 8 }).map((n) => "*".repeat(n)),
  fc.integer({ min: 4, max: 8 }).map((n) => "_".repeat(n)),
  fc.constant("--"),

  // Block comment delimiter (pushes into block_comment mode)
  fc.integer({ min: 4, max: 8 }).map((n) => "/".repeat(n)),

  // LineComment
  fc.string({ maxLength: 40 })
    .map((s) => `// ${s}`),

  // ThematicBreak / PageBreak
  fc.constantFrom("'''", "<<<"),

  // AttributeEntry: `:name: value`
  fc.tuple(
    fc.stringMatching(/[A-Za-z_][\w-]{0,9}/),
    fc.string({ maxLength: 20 }),
  ).map(([name, val]) => `:${name}: ${val}`),

  // BlockAnchor: `[[id]]`
  fc.stringMatching(/[A-Za-z_][\w-]{0,14}/)
    .map((s) => `[[${s}]]`),

  // BlockAttributeList: `[source,ruby]`, `[#myid]`, `[.role]`
  fc.string({ maxLength: 20 })
    .map((s) => `[${s}]`),

  // BlockTitle: `.TitleText` (dot + non-space non-dot)
  fc.string({ minLength: 1, maxLength: 30 })
    .map((s) => `.${s.replace(/^[. ]/, "T")}`),

  // AdmonitionMarker
  fc.constantFrom(
    "NOTE: text",
    "TIP: text",
    "IMPORTANT: text",
    "CAUTION: text",
    "WARNING: text",
  ),

  // UnorderedListMarker: `*{1,5} item` or `- item`
  fc.oneof(
    fc.integer({ min: 1, max: 5 })
      .map((n) => "*".repeat(n) + " item"),
    fc.constant("- item"),
  ),

  // OrderedListMarker: `.{1,5} item`
  fc.integer({ min: 1, max: 5 })
    .map((n) => ".".repeat(n) + " item"),

  // CalloutListMarker: `<N> item` or `<.> item`
  fc.oneof(
    fc.integer({ min: 1, max: 99 })
      .map((n) => `<${String(n)}> item`),
    fc.constant("<.> item"),
  ),

  // IndentedLine: leading spaces + content
  fc.tuple(
    fc.integer({ min: 1, max: 8 }),
    fc.string({ minLength: 1, maxLength: 40 }),
  ).map(([spaces, text]) => " ".repeat(spaces) + text.trimStart()),

  // Blank line
  fc.constant(""),

  // Random text (garbage / paragraph content)
  fc.string({ unit: "grapheme-composite", maxLength: 100 }),
);

// Assemble lines into a document, always ending with newline.
export const adocDocument = fc
  .array(adocLine, { minLength: 1, maxLength: 50 })
  .map((lines) => lines.join("\n") + "\n");
```

**Step 2: Verify types**

Run: `bun run check`
Expected: PASS

**Step 3: Commit**

```bash
jj describe -m "test: add fast-check arbitraries for parser fuzzing"
jj new
```

---

### Task 3: Parser fuzz test

**Files:**

- Create: `tests/parser/fuzz.test.ts`

**Step 1: Write the property tests**

```ts
import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { parse } from "../../src/parser.js";
import { randomInput, adocDocument } from "../fuzz/arbitraries.js";

// Property-based fuzz tests for the parser. These complement
// the hand-written error recovery tests in error-recovery.test.ts
// by exploring the input space randomly. See
// docs/plans/2026-02-22-parser-fuzzing-design.md for design.

const NUM_RUNS = 1000;
const TIME_LIMIT = 20_000;

describe("parser fuzz", () => {
  test(
    "tier 1: random input never throws",
    () => {
      fc.assert(
        fc.property(randomInput, (input) => {
          const doc = parse(input);
          expect(doc.type).toBe("document");
        }),
        { numRuns: NUM_RUNS, interruptAfterTimeLimit: TIME_LIMIT },
      );
    },
    { timeout: 30_000 },
  );

  test(
    "tier 2: AsciiDoc line soup never throws",
    () => {
      fc.assert(
        fc.property(adocDocument, (input) => {
          const doc = parse(input);
          expect(doc.type).toBe("document");
        }),
        { numRuns: NUM_RUNS, interruptAfterTimeLimit: TIME_LIMIT },
      );
    },
    { timeout: 30_000 },
  );
});
```

**Step 2: Run the tests**

Run: `bun vitest run tests/parser/fuzz.test.ts`
Expected: PASS (both properties hold). If either fails, fast-check
will print the seed and shrunken counterexample — fix the underlying
parser issue before proceeding.

**Step 3: Commit**

```bash
jj describe -m "test: fuzz parser with random and AsciiDoc line soup inputs"
jj new
```

---

### Task 4: Formatter fuzz test

**Files:**

- Create: `tests/format/fuzz.test.ts`

**Step 1: Write the idempotency property test**

```ts
import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { formatAdoc } from "../helpers.js";
import { adocDocument } from "../fuzz/arbitraries.js";

// Property-based fuzz test for the formatter. Verifies that
// formatting is idempotent: format(format(x)) === format(x).
// Uses the AsciiDoc line-soup generator (tier 2) because
// purely random strings rarely exercise the printer. See
// docs/plans/2026-02-22-parser-fuzzing-design.md for design.

const NUM_RUNS = 500;
const TIME_LIMIT = 30_000;

describe("formatter fuzz", () => {
  test(
    "formatting is idempotent on AsciiDoc line soup",
    async () => {
      await fc.assert(
        fc.asyncProperty(adocDocument, async (input) => {
          const first = await formatAdoc(input);
          const second = await formatAdoc(first);
          expect(second).toBe(first);
        }),
        { numRuns: NUM_RUNS, interruptAfterTimeLimit: TIME_LIMIT },
      );
    },
    { timeout: 60_000 },
  );
});
```

Note: `formatAdoc` is async (it calls `prettier.format`), so this
uses `fc.asyncProperty` and `fc.assert` returns a promise. The
Vitest timeout is 60s because async property tests with 500 runs
of formatting are slower.

**Step 2: Run the test**

Run: `bun vitest run tests/format/fuzz.test.ts`
Expected: PASS (idempotency holds). If it fails, the shrunken
counterexample reveals which input breaks idempotency — fix the
printer before proceeding.

**Step 3: Commit**

```bash
jj describe -m "test: fuzz formatter idempotency with AsciiDoc line soup"
jj new
```

---

### Task 5: Run full check suite and final commit

**Step 1: Run all checks**

Run: `bun run check && bun run lint && bun test && bun run build`
Expected: All PASS

**Step 2: Fix any lint or type issues**

The generators use magic numbers (4, 8, 50, etc.) and the test
files may trigger lint rules. Test files have relaxed lint rules
per the project config, but the `arbitraries.ts` file may need
`eslint-disable` comments for magic numbers since it lives in
`tests/fuzz/` (check whether the eslint config relaxes rules for
all files under `tests/`).

**Step 3: Final commit if any fixups were needed**

```bash
jj describe -m "chore: fix lint issues in fuzz tests"
jj new
```
