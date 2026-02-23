import { describe, test, expect } from "vitest";
import { parse } from "../../src/parser.js";
import type { BlockNode, InlineNode, ParagraphNode } from "../../src/ast.js";

/** Narrow a block to a paragraph, throwing if the type doesn't match. */
function asParagraph(node: BlockNode): ParagraphNode {
  if (node.type !== "paragraph") {
    throw new Error(`Expected paragraph, got ${node.type}`);
  }
  return node;
}

/** Get the inline children of the first paragraph. */
function inlineNodes(input: string): InlineNode[] {
  const document = parse(input);
  return asParagraph(document.children[0]).children;
}

describe("inline formatting — bold", () => {
  test("*bold* → bold node containing text", () => {
    const nodes = inlineNodes("*bold*\n");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe("bold");
    if (nodes[0].type === "bold") {
      expect(nodes[0].children).toHaveLength(1);
      expect(nodes[0].children[0].type).toBe("text");
      if (nodes[0].children[0].type === "text") {
        expect(nodes[0].children[0].value).toBe("bold");
      }
    }
  });

  test("**unconstrained bold** mid-word", () => {
    const nodes = inlineNodes("un**bold**ed\n");
    expect(nodes).toHaveLength(3);
    expect(nodes[0].type).toBe("text");
    expect(nodes[1].type).toBe("bold");
    expect(nodes[2].type).toBe("text");
    if (nodes[0].type === "text") {
      expect(nodes[0].value).toBe("un");
    }
    if (nodes[1].type === "bold") {
      expect(nodes[1].children).toHaveLength(1);
      if (nodes[1].children[0].type === "text") {
        expect(nodes[1].children[0].value).toBe("bold");
      }
    }
    if (nodes[2].type === "text") {
      expect(nodes[2].value).toBe("ed");
    }
  });
});

describe("inline formatting — italic", () => {
  test("_italic_ → italic node", () => {
    const nodes = inlineNodes("_italic_\n");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe("italic");
    if (nodes[0].type === "italic") {
      expect(nodes[0].children).toHaveLength(1);
      if (nodes[0].children[0].type === "text") {
        expect(nodes[0].children[0].value).toBe("italic");
      }
    }
  });

  test("__unconstrained italic__", () => {
    const nodes = inlineNodes("un__italic__ed\n");
    expect(nodes).toHaveLength(3);
    expect(nodes[1].type).toBe("italic");
  });
});

describe("inline formatting — monospace", () => {
  test("`mono` → monospace node", () => {
    const nodes = inlineNodes("`mono`\n");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe("monospace");
    if (nodes[0].type === "monospace") {
      expect(nodes[0].children).toHaveLength(1);
      if (nodes[0].children[0].type === "text") {
        expect(nodes[0].children[0].value).toBe("mono");
      }
    }
  });

  test("``unconstrained mono``", () => {
    const nodes = inlineNodes("un``mono``ed\n");
    expect(nodes).toHaveLength(3);
    expect(nodes[1].type).toBe("monospace");
  });
});

describe("inline formatting — highlight", () => {
  test("#highlight# → highlight node", () => {
    const nodes = inlineNodes("#highlight#\n");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe("highlight");
    if (nodes[0].type === "highlight") {
      expect(nodes[0].children).toHaveLength(1);
      if (nodes[0].children[0].type === "text") {
        expect(nodes[0].children[0].value).toBe("highlight");
      }
    }
  });

  test("##unconstrained highlight##", () => {
    const nodes = inlineNodes("un##highlight##ed\n");
    expect(nodes).toHaveLength(3);
    expect(nodes[1].type).toBe("highlight");
  });
});

describe("inline formatting — mixed", () => {
  test("text + bold + text + italic", () => {
    const nodes = inlineNodes("This is *bold* and _italic_\n");
    expect(nodes).toHaveLength(4);
    expect(nodes[0].type).toBe("text");
    expect(nodes[1].type).toBe("bold");
    expect(nodes[2].type).toBe("text");
    expect(nodes[3].type).toBe("italic");
    if (nodes[0].type === "text") {
      expect(nodes[0].value).toBe("This is ");
    }
    if (nodes[2].type === "text") {
      expect(nodes[2].value).toBe(" and ");
    }
  });

  test("nested: *_bold italic_*", () => {
    const nodes = inlineNodes("*_bold italic_*\n");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe("bold");
    if (nodes[0].type === "bold") {
      expect(nodes[0].children).toHaveLength(1);
      expect(nodes[0].children[0].type).toBe("italic");
      if (nodes[0].children[0].type === "italic") {
        expect(nodes[0].children[0].children).toHaveLength(1);
        if (nodes[0].children[0].children[0].type === "text") {
          expect(nodes[0].children[0].children[0].value).toBe("bold italic");
        }
      }
    }
  });
});

describe("inline formatting — backslash escapes", () => {
  test(String.raw`\*not bold* → literal text`, () => {
    const nodes = inlineNodes(`${String.raw`\*not bold*`}\n`);
    // The escaped mark should produce text, not a bold node.
    // The backslash is preserved in the value for round-trip
    // safety — the formatter re-emits it so re-parsing
    // produces the same AST.
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe("text");
    if (nodes[0].type === "text") {
      expect(nodes[0].value).toBe(String.raw`\*not bold*`);
    }
  });

  test(String.raw`\_not italic_ → literal text`, () => {
    const nodes = inlineNodes(`${String.raw`\_not italic_`}\n`);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe("text");
    if (nodes[0].type === "text") {
      expect(nodes[0].value).toBe(String.raw`\_not italic_`);
    }
  });
});

describe("inline formatting — role/style attributes", () => {
  test("[red]#styled text# → highlight with role", () => {
    const nodes = inlineNodes("[red]#styled text#\n");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe("highlight");
    if (nodes[0].type === "highlight") {
      expect(nodes[0].role).toBe("red");
      expect(nodes[0].children).toHaveLength(1);
      if (nodes[0].children[0].type === "text") {
        expect(nodes[0].children[0].value).toBe("styled text");
      }
    }
  });

  test("[.role]#text# — dot-prefixed role", () => {
    const nodes = inlineNodes("[.role]#text#\n");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe("highlight");
    if (nodes[0].type === "highlight") {
      expect(nodes[0].role).toBe(".role");
    }
  });

  test("[underline]#text# — underline role", () => {
    const nodes = inlineNodes("[underline]#text#\n");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe("highlight");
    if (nodes[0].type === "highlight") {
      expect(nodes[0].role).toBe("underline");
    }
  });
});

describe("inline formatting — attribute references", () => {
  test("{name} → attribute reference node", () => {
    const nodes = inlineNodes("{name}\n");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe("attributeReference");
    if (nodes[0].type === "attributeReference") {
      expect(nodes[0].name).toBe("name");
    }
  });

  test("text + attrRef + text", () => {
    const nodes = inlineNodes("See {project-name} for details\n");
    expect(nodes).toHaveLength(3);
    expect(nodes[0].type).toBe("text");
    expect(nodes[1].type).toBe("attributeReference");
    expect(nodes[2].type).toBe("text");
    if (nodes[0].type === "text") {
      expect(nodes[0].value).toBe("See ");
    }
    if (nodes[1].type === "attributeReference") {
      expect(nodes[1].name).toBe("project-name");
    }
    if (nodes[2].type === "text") {
      expect(nodes[2].value).toBe(" for details");
    }
  });

  test("{authors} as entire paragraph", () => {
    const nodes = inlineNodes("{authors}\n");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe("attributeReference");
    if (nodes[0].type === "attributeReference") {
      expect(nodes[0].name).toBe("authors");
    }
  });

  test("{counter:name} → attribute reference", () => {
    const nodes = inlineNodes("{counter:name}\n");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe("attributeReference");
    if (nodes[0].type === "attributeReference") {
      expect(nodes[0].name).toBe("counter:name");
    }
  });

  test("{counter2:name} → attribute reference", () => {
    const nodes = inlineNodes("{counter2:name}\n");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe("attributeReference");
    if (nodes[0].type === "attributeReference") {
      expect(nodes[0].name).toBe("counter2:name");
    }
  });
});

describe("inline formatting — stray/unmatched marks", () => {
  test("lone * in text is plain text", () => {
    const nodes = inlineNodes("a * b\n");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe("text");
    if (nodes[0].type === "text") {
      expect(nodes[0].value).toBe("a * b");
    }
  });

  test("unmatched opening * is plain text", () => {
    const nodes = inlineNodes("*no closing mark\n");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe("text");
    if (nodes[0].type === "text") {
      expect(nodes[0].value).toBe("*no closing mark");
    }
  });

  test("mid-word * without boundary is plain text", () => {
    const nodes = inlineNodes("a*b*c\n");
    // Constrained marks need word boundaries — a*b*c
    // has no boundary before the first * or after the
    // second *, so both are plain text.
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe("text");
    if (nodes[0].type === "text") {
      expect(nodes[0].value).toBe("a*b*c");
    }
  });
});

describe("inline formatting — interleaved marks", () => {
  test("*_foo*_ — misnested bold/italic", () => {
    // The bold pair closes around `_foo`, and the trailing
    // `_` becomes plain text (no matching open mark).
    const nodes = inlineNodes("*_foo*_\n");
    expect(nodes).toHaveLength(2);
    expect(nodes[0].type).toBe("bold");
    if (nodes[0].type === "bold") {
      expect(nodes[0].children).toHaveLength(1);
      expect(nodes[0].children[0].type).toBe("text");
      if (nodes[0].children[0].type === "text") {
        expect(nodes[0].children[0].value).toBe("_foo");
      }
    }
    expect(nodes[1].type).toBe("text");
  });
});

describe("inline formatting — adjacent spans", () => {
  test("*bold*_italic_ — consecutive constrained marks", () => {
    // Adjacent constrained marks with no space between the
    // closing and opening marks. Mark characters are word
    // boundaries for each other, so *bold*_italic_ parses
    // as two separate formatting spans.
    const nodes = inlineNodes("*bold*_italic_\n");
    expect(nodes).toHaveLength(2);
    expect(nodes[0].type).toBe("bold");
    expect(nodes[1].type).toBe("italic");
  });
});

describe("inline formatting — deep nesting", () => {
  test("*_`code`_* — three levels", () => {
    const nodes = inlineNodes("*_`code`_*\n");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe("bold");
    if (nodes[0].type === "bold") {
      expect(nodes[0].children).toHaveLength(1);
      expect(nodes[0].children[0].type).toBe("italic");
      if (nodes[0].children[0].type === "italic") {
        expect(nodes[0].children[0].children).toHaveLength(1);
        expect(nodes[0].children[0].children[0].type).toBe("monospace");
        if (nodes[0].children[0].children[0].type === "monospace") {
          expect(nodes[0].children[0].children[0].children).toHaveLength(1);
          expect(nodes[0].children[0].children[0].children[0].type).toBe(
            "text",
          );
          if (nodes[0].children[0].children[0].children[0].type === "text") {
            expect(nodes[0].children[0].children[0].children[0].value).toBe(
              "code",
            );
          }
        }
      }
    }
  });
});

describe("inline formatting — unconstrained role highlight", () => {
  test("[role]##text## — role with unconstrained highlight", () => {
    const nodes = inlineNodes("[role]##text##\n");
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe("highlight");
    if (nodes[0].type === "highlight") {
      expect(nodes[0].role).toBe("role");
      expect(nodes[0].constrained).toBe(false);
    }
  });
});
