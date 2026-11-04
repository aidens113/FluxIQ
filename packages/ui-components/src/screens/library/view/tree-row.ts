import { createElement } from "../../../dom/index.ts";
import type { LibraryTreeNode } from "../tree/index.ts";
import { failureWords, trustWords } from "../words/index.ts";
import type { LibraryViewContext } from "./view-context.ts";

const SUBFLOWS = (count: number): string => `${count} ${count === 1 ? "subflow" : "subflows"}`;

/** One row of the tree: what it is called, where it stands, and how many it uses. A subflow no longer saved is told, and is not a button. */
export function treeRow(node: LibraryTreeNode, open: (node: LibraryTreeNode) => void, context: LibraryViewContext): HTMLElement {
  const card = node.card;
  if (card === undefined) return createElement("p", { className: "library-row library-row-gone", text: "A subflow that is no longer saved" });
  const facts = [trustWords(card)];
  if (node.repeat) facts.push("shown above");
  else if (node.uses > 0) facts.push(`uses ${SUBFLOWS(node.uses)}`);
  const failure = failureWords(card, context.now());
  const text = createElement("span", { className: "library-row-text" }, [
    createElement("span", { className: "library-row-name", text: card.name }),
    createElement("span", { className: "library-row-line", text: facts.join(" \u00b7 ") }),
    ...(failure === undefined ? [] : [createElement("span", { className: "library-row-line library-row-warn", text: failure })])
  ]);
  const button = createElement("button", { className: `library-row${node.matched ? "" : " library-row-context"}`, attrs: { type: "button" } }, [text, createElement("span", { className: "library-row-go", text: "\u203a", attrs: { "aria-hidden": "true" } })]);
  button.addEventListener("click", () => open(node));
  context.register(node.key, button);
  return button;
}
