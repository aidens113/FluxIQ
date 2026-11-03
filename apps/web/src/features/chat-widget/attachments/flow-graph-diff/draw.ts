// A structural repair, drawn as what it is.
//
// The adaptation review renders a before/after table of leaf field paths, and
// for a repair that adds a node, rewires an edge or splits a Subflow that is
// worse than nothing: fifty rows of `nodes.3.parameters.selector` is not a
// change anyone can read. This draws the structure instead -- what was added,
// what was removed, what changed and where -- read-only, inside the turn that
// proposed it.
//
// It deliberately is not the graph editor. A transcript entry is evidence, not
// something to edit, and wiring the editor's mutation surface into it to draw
// a picture would be the wrong trade.

import { createElement, lucideIcon, type ChatAttachment } from "@fluxiq/ui-components";
import type { GraphDiffEntry } from "./flow-graph-diff";
import { parseFlowGraphDiff } from "./parse";

const CHANGES = [
  { key: "added", word: "Added", icon: "plus" },
  { key: "removed", word: "Removed", icon: "minus" },
  { key: "changed", word: "Changed", icon: "pencil" }
] as const;

export function drawFlowGraphDiff(payload: unknown, attachment: ChatAttachment): HTMLElement {
  const diff = parseFlowGraphDiff(payload);
  if (!diff) {
    return createElement("p", {
      className: "panel-diff-empty",
      text: `This turn carries a Flow change (${attachment.ref}) that could not be read, so nothing is shown.`
    });
  }
  const rows = CHANGES.flatMap(({ key, word, icon }) => diff[key].map((entry) => row(key, word, icon, entry)));
  const heading = createElement("header", { className: "panel-diff-heading" }, [
    lucideIcon("git-branch", 15),
    createElement("strong", { text: "Proposed Flow change" }),
    ...(diff.flowId ? [createElement("small", { text: diff.flowId })] : [])
  ]);
  const body = rows.length
    ? createElement("div", { className: "panel-diff", attrs: { role: "table", "aria-label": "Structural changes" } }, [
      createElement("div", { className: "panel-diff-row heading", attrs: { role: "row" } }, ["Change", "Where", "Detail"].map((name) =>
        createElement("span", { text: name, attrs: { role: "columnheader" } }))),
      ...rows
    ])
    : createElement("p", { className: "panel-diff-empty", text: "This change adds, removes and alters nothing." });
  return createElement("section", { className: "panel-diff-card", attrs: { "aria-label": "Proposed Flow change" } }, [heading, body]);
}

function row(change: string, word: string, icon: string, entry: GraphDiffEntry): HTMLElement {
  return createElement("div", { className: "panel-diff-row", attrs: { role: "row", "data-change": change } }, [
    createElement("span", { attrs: { role: "cell" } }, [lucideIcon(icon, 13), word]),
    createElement("span", { text: entry.label, attrs: { role: "cell" } }),
    createElement("span", { text: entry.detail ?? "-", attrs: { role: "cell" } })
  ]);
}
