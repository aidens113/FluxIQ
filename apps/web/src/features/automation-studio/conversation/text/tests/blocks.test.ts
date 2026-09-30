import { describe, expect, it } from "vitest";
import { conversationTextBlocks, conversationTextSpans } from "..";

describe("a turn's text, read into blocks", () => {
  it("reads paragraphs, a bullet list and a numbered list", () => {
    const blocks = conversationTextBlocks("I built **Product list**. It collects:\n\n- the name\n- its price\n\n1. open\n2. read\nOn a test run it found `12` products.");
    expect(blocks.map((block) => block.kind)).toEqual(["paragraph", "list", "list", "paragraph"]);
    expect(blocks[1]).toEqual({ kind: "list", ordered: false, items: [[{ kind: "text", text: "the name" }], [{ kind: "text", text: "its price" }]] });
    expect(blocks[2]).toMatchObject({ kind: "list", ordered: true });
    expect(blocks[3]).toEqual({ kind: "paragraph", lines: [[{ kind: "text", text: "On a test run it found " }, { kind: "code", text: "12" }, { kind: "text", text: " products." }]] });
  });

  it("keeps a line break inside a paragraph and reads a heading line", () => {
    const blocks = conversationTextBlocks("## Done\nFirst line\r\nSecond line");
    expect(blocks[0]).toEqual({ kind: "heading", spans: [{ kind: "text", text: "Done" }] });
    expect(blocks[1]).toMatchObject({ kind: "paragraph", lines: [[{ text: "First line" }], [{ text: "Second line" }]] });
  });

  it("leaves text that only looks like markup as the words it was", () => {
    expect(conversationTextSpans("<b>not bold</b> and **unclosed")).toEqual([{ kind: "text", text: "<b>not bold</b> and **unclosed" }]);
    expect(conversationTextSpans("**bold** then `x`")).toEqual([
      { kind: "strong", text: "bold" },
      { kind: "text", text: " then " },
      { kind: "code", text: "x" }
    ]);
  });
});
