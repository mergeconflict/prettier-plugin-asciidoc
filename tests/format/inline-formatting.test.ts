/**
 * Format tests for inline formatting — verifies that the printer
 * produces correct output for bold, italic, monospace, highlight,
 * and attribute references.
 */
import { describe, test, expect } from "vitest";
import { formatAdoc } from "../helpers.js";

describe("inline formatting — format output", () => {
  test("*bold* is preserved", async () => {
    const input = "*bold*\n";
    expect(await formatAdoc(input)).toBe("*bold*\n");
  });

  test("_italic_ is preserved", async () => {
    const input = "_italic_\n";
    expect(await formatAdoc(input)).toBe("_italic_\n");
  });

  test("`mono` is preserved", async () => {
    const input = "`mono`\n";
    expect(await formatAdoc(input)).toBe("`mono`\n");
  });

  test("#highlight# is preserved", async () => {
    const input = "#highlight#\n";
    expect(await formatAdoc(input)).toBe("#highlight#\n");
  });

  test("mixed inline formatting is preserved", async () => {
    const input = "This is *bold* and _italic_ text.\n";
    expect(await formatAdoc(input)).toBe("This is *bold* and _italic_ text.\n");
  });

  test("unconstrained **bold** is preserved", async () => {
    const input = "un**bold**ed\n";
    expect(await formatAdoc(input)).toBe("un**bold**ed\n");
  });

  test("unconstrained __italic__ is preserved", async () => {
    const input = "un__italic__ed\n";
    expect(await formatAdoc(input)).toBe("un__italic__ed\n");
  });

  test("unconstrained ``mono`` is preserved", async () => {
    const input = "un``mono``ed\n";
    expect(await formatAdoc(input)).toBe("un``mono``ed\n");
  });

  test("unconstrained ##highlight## is preserved", async () => {
    const input = "un##highlight##ed\n";
    expect(await formatAdoc(input)).toBe("un##highlight##ed\n");
  });

  test("nested *_bold italic_* is preserved", async () => {
    const input = "*_bold italic_*\n";
    expect(await formatAdoc(input)).toBe("*_bold italic_*\n");
  });

  test(String.raw`backslash escapes \*not bold* are preserved`, async () => {
    const input = `${String.raw`\*not bold*`}\n`;
    expect(await formatAdoc(input)).toBe(`${String.raw`\*not bold*`}\n`);
  });

  test("{name} attribute reference is preserved", async () => {
    const input = "{name}\n";
    expect(await formatAdoc(input)).toBe("{name}\n");
  });

  test("attribute reference in text is preserved", async () => {
    const input = "See {project-name} for details.\n";
    expect(await formatAdoc(input)).toBe("See {project-name} for details.\n");
  });

  test("[red]#styled text# with role is preserved", async () => {
    const input = "[red]#styled text#\n";
    expect(await formatAdoc(input)).toBe("[red]#styled text#\n");
  });

  test("[.role]#text# with dot-prefixed role is preserved", async () => {
    const input = "[.role]#text#\n";
    expect(await formatAdoc(input)).toBe("[.role]#text#\n");
  });

  test("{counter:name} is preserved", async () => {
    const input = "{counter:name}\n";
    expect(await formatAdoc(input)).toBe("{counter:name}\n");
  });

  test("formatting is idempotent", async () => {
    const input = "This is *bold* and _italic_ with `mono` and {attr}.\n";
    const first = await formatAdoc(input);
    const second = await formatAdoc(first);
    expect(second).toBe(first);
  });
});

describe("inline formatting — reflow with inline marks", () => {
  test("reflow preserves bold span across line break", async () => {
    // The bold span should not be split across lines.
    const input = "*bold text here*\n";
    const result = await formatAdoc(input, { printWidth: 10 });
    // Bold marks must stay paired — verify the result re-parses
    // correctly by formatting again.
    const second = await formatAdoc(result, { printWidth: 10 });
    expect(second).toBe(result);
  });

  test("reflow wraps around inline marks", async () => {
    const input = "Some text before *bold* and after bold text here.\n";
    const result = await formatAdoc(input, { printWidth: 30 });
    // Must be idempotent.
    const second = await formatAdoc(result, { printWidth: 30 });
    expect(second).toBe(result);
  });

  test("attribute reference is not broken by reflow", async () => {
    const input =
      "This is a long paragraph with {attribute-name} in the middle of it.\n";
    const result = await formatAdoc(input, { printWidth: 30 });
    // The attribute reference should remain intact.
    expect(result).toContain("{attribute-name}");
    // Must be idempotent.
    const second = await formatAdoc(result, { printWidth: 30 });
    expect(second).toBe(result);
  });
});

describe("inline formatting — edge case round-trips", () => {
  test("lone * in text is preserved", async () => {
    const input = "a * b\n";
    expect(await formatAdoc(input)).toBe("a * b\n");
  });

  test("adjacent *bold*_italic_ round-trips", async () => {
    const input = "*bold*_italic_\n";
    expect(await formatAdoc(input)).toBe("*bold*_italic_\n");
  });

  test("deeply nested *_`code`_* round-trips", async () => {
    const input = "*_`code`_*\n";
    expect(await formatAdoc(input)).toBe("*_`code`_*\n");
  });

  test("[role]##text## round-trips", async () => {
    const input = "[role]##text##\n";
    expect(await formatAdoc(input)).toBe("[role]##text##\n");
  });
});
