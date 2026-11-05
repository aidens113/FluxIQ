import { createElement } from "../../../dom/index.ts";
import type { LibrarySite, LibraryTreeNode } from "../tree/index.ts";
import { treeList } from "./tree-list.ts";
import type { LibraryViewContext } from "./view-context.ts";

/** What the list shows: the tree as filtered, how many subflows there are at all, and how the read stands. */
export type LibraryListModel = {
  sites: readonly LibrarySite[];
  text: string;
  total: number;
  loaded: boolean;
  loading: boolean;
  /** A failed read, in words. The tree stays on screen beneath it. */
  problem: string | undefined;
};

export const LIBRARY_EMPTY = "Subflows are the reusable parts of your automations, and one is saved here when FluxIQ keeps part of a finished task to use again.";

const SUBFLOWS = (count: number): string => `${count} ${count === 1 ? "subflow" : "subflows"}`;

/** The library: its sites and what is on each, or in a sentence why there is nothing to show. */
export function listView(model: LibraryListModel, hooks: { open(node: LibraryTreeNode): void; retry(): void }, context: LibraryViewContext): HTMLElement {
  const root = createElement("div", { className: "library-list" });
  if (model.problem !== undefined) {
    const retry = createElement("button", { className: "library-link", text: "Try again", attrs: { type: "button" } });
    retry.addEventListener("click", hooks.retry);
    root.append(createElement("p", { className: "library-note", attrs: { role: "status" } }, [`${model.problem} `, retry]));
  }
  if (!model.loaded) {
    if (model.problem === undefined) root.append(createElement("p", { className: "library-quiet", text: model.loading ? "Reading your subflows..." : "" }));
    return root;
  }
  if (model.total === 0) {
    root.append(createElement("p", { className: "library-quiet", text: LIBRARY_EMPTY }));
    return root;
  }
  if (model.sites.length === 0) {
    root.append(createElement("p", { className: "library-quiet", text: `No subflow matches \u201c${model.text.trim()}\u201d.` }));
    return root;
  }
  for (const site of model.sites) {
    root.append(
      createElement("section", { className: "library-site" }, [
        createElement("h3", { className: "library-site-name" }, [createElement("span", { text: site.host }), createElement("span", { className: "library-site-count", text: SUBFLOWS(site.count) })]),
        treeList(site.nodes, hooks.open, context)
      ])
    );
  }
  return root;
}
