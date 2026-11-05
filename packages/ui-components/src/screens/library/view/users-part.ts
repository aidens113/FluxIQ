import { createElement } from "../../../dom/index.ts";
import type { SubflowDetail } from "../types.ts";
import { detailSection } from "./detail-section.ts";
import type { LibraryViewContext } from "./view-context.ts";

/** Who uses it: how many automations, and which other subflows, each a button that opens it. Nothing until the read arrives. */
export function usersPart(detail: SubflowDetail | undefined, names: ReadonlyMap<string, string>, open: (partId: string, key: string) => void, context: LibraryViewContext): HTMLElement | undefined {
  if (detail === undefined) return undefined;
  const flows = detail.callers.filter((caller) => caller.kind === "flow").length;
  const children: HTMLElement[] = [];
  if (flows > 0) children.push(createElement("p", { text: flows === 1 ? "1 automation uses it." : `${flows} automations use it.` }));
  const subflows = detail.callers.flatMap((caller) => (caller.kind === "part" ? [caller.partId] : []));
  if (subflows.length > 0) {
    const list = createElement("ul", { className: "library-lines" });
    subflows.forEach((partId, at) => {
      const name = names.get(partId);
      if (name === undefined) {
        list.append(createElement("li", { text: "Another saved subflow" }));
        return;
      }
      const key = `user/${at}:${partId}`;
      const button = createElement("button", { className: "library-link", text: name, attrs: { type: "button" } });
      button.addEventListener("click", () => open(partId, key));
      context.register(key, button);
      list.append(createElement("li", {}, [button]));
    });
    children.push(list);
  }
  if (children.length === 0) children.push(createElement("p", { text: "Nothing uses it yet." }));
  return detailSection("Who uses it", children);
}
