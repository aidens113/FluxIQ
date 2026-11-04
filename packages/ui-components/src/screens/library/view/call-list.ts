import { createElement } from "../../../dom/index.ts";
import type { SubflowCallNode } from "../types.ts";
import type { LibraryViewContext } from "./view-context.ts";

/** What a subflow calls, each a button that opens it, with what that calls nested beneath. */
export function callList(nodes: readonly SubflowCallNode[], open: (partId: string, key: string) => void, context: LibraryViewContext, trail = "call"): HTMLElement {
  const list = createElement("ul", { className: "library-lines library-calls" });
  nodes.forEach((node, at) => {
    const key = `${trail}/${at}:${node.partId}`;
    const button = createElement("button", { className: "library-link", text: node.name, attrs: { type: "button" } });
    button.addEventListener("click", () => open(node.partId, key));
    context.register(key, button);
    const item = createElement("li", {}, [button]);
    if (node.calls.length > 0) item.append(callList(node.calls, open, context, key));
    list.append(item);
  });
  return list;
}
