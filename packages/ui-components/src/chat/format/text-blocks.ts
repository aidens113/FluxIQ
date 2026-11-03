// Assistant blocks (`parseAssistantText`) as elements. Every string goes in
// as a text node through `createElement`; nothing here parses HTML.

import { createElement, type ElementChild } from "../../dom/index.ts";
import type { TextBlock, TextRun } from "./assistant-text.ts";

/** The elements for `blocks`, in order. */
export function renderTextBlocks(blocks: readonly TextBlock[]): HTMLElement[] {
  return blocks.map((block) => {
    switch (block.kind) {
      case "paragraph":
        return createElement("p", { className: "chat-p" }, runNodes(block.runs));
      case "heading":
        return createElement("p", { className: "chat-p chat-h" }, runNodes(block.runs));
      case "code":
        return createElement("pre", { className: "chat-pre" }, [createElement("code", { text: block.text })]);
      case "list": {
        const items = block.items.map((runs) => createElement("li", {}, runNodes(runs)));
        if (!block.ordered) return createElement("ul", { className: "chat-list" }, items);
        const list = createElement("ol", { className: "chat-list" }, items);
        if (block.start !== 1) list.setAttribute("start", String(block.start));
        return list;
      }
    }
  });
}

function runNodes(runs: readonly TextRun[]): ElementChild[] {
  return runs.map((run) => {
    if (run.kind === "strong") return createElement("strong", { text: run.text });
    if (run.kind === "code") return createElement("code", { className: "chat-code", text: run.text });
    return run.text;
  });
}
