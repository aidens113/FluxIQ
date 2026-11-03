// FluxIQ's words, formatted: paragraphs, lists, headings, code, bold, inline
// code and links as text -- and markup in the text stays text.

import assert from "node:assert/strict";
import { test } from "vitest";
import { fake, withFakeDocument } from "../../../testing/index.ts";
import { parseAssistantText, parseRuns } from "../assistant-text.ts";
import { renderTextBlocks } from "../text-blocks.ts";

test("blank lines make paragraphs; a single break stays inside one", () => {
  assert.deepEqual(parseAssistantText("First line\nsame paragraph\n\nSecond"), [
    { kind: "paragraph", runs: [{ kind: "text", text: "First line\nsame paragraph" }] },
    { kind: "paragraph", runs: [{ kind: "text", text: "Second" }] }
  ]);
});

test("bulleted and numbered lists, with continuation lines and their own start", () => {
  const blocks = parseAssistantText("I will:\n- open the page\n- read **every** row\n  and keep it\n\n3. check\n4) save");
  assert.deepEqual(blocks, [
    { kind: "paragraph", runs: [{ kind: "text", text: "I will:" }] },
    { kind: "list", ordered: false, start: 1, items: [
      [{ kind: "text", text: "open the page" }],
      [{ kind: "text", text: "read " }, { kind: "strong", text: "every" }, { kind: "text", text: " row\nand keep it" }]
    ] },
    { kind: "list", ordered: true, start: 3, items: [[{ kind: "text", text: "check" }], [{ kind: "text", text: "save" }]] }
  ]);
});

test("headings, fenced code kept verbatim, inline code, and links as text", () => {
  assert.deepEqual(parseAssistantText("## Plan\n```\nconst x = **1**;\n```"), [
    { kind: "heading", runs: [{ kind: "text", text: "Plan" }] },
    { kind: "code", text: "const x = **1**;" }
  ]);
  assert.deepEqual(parseRuns("Run `web.dom.click` on [the form](https://example.test/form) or https://a.test"), [
    { kind: "text", text: "Run " },
    { kind: "code", text: "web.dom.click" },
    { kind: "text", text: " on the form (https://example.test/form) or https://a.test" }
  ]);
  assert.deepEqual(parseRuns("[https://a.test](https://a.test)"), [{ kind: "text", text: "https://a.test" }]);
  assert.deepEqual(parseRuns("2 * 3 and a lone ` and ** stay"), [{ kind: "text", text: "2 * 3 and a lone ` and ** stay" }]);
});

test("markup in FluxIQ's words is shown as text, never built as elements", async () => {
  await withFakeDocument(() => {
    const hostile = "<img src=x onerror=alert(1)> **<script>bad()</script>** `<b>`";
    const nodes = renderTextBlocks(parseAssistantText(hostile)).map(fake);
    const tags = nodes.flatMap((node) => [node, ...node.descendants()]).map((node) => node.tagName);
    assert.deepEqual(tags, ["P", "STRONG", "CODE"]);
    assert.equal(nodes[0]!.textContent, "<img src=x onerror=alert(1)> <script>bad()</script> <b>");
  });
});

test("blocks render as paragraphs, lists with their start, and preformatted code", async () => {
  await withFakeDocument(() => {
    const nodes = renderTextBlocks(parseAssistantText("Done.\n\n2. two\n3. three\n\n```\nx\n```")).map(fake);
    assert.deepEqual(nodes.map((node) => node.tagName), ["P", "OL", "PRE"]);
    assert.equal(nodes[1]!.getAttribute("start"), "2");
    assert.deepEqual(nodes[1]!.children.map((item) => item.textContent), ["two", "three"]);
    assert.equal(nodes[2]!.textContent, "x");
  });
});
