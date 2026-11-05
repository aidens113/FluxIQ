import { createElement } from "../../../dom/index.ts";
import type { SubflowDetail } from "../types.ts";
import { detailSection } from "./detail-section.ts";
import type { LibraryViewContext } from "./view-context.ts";

/** Who uses it: how many automations, and which other subflows, each a button that opens it. Nothing until the read arrives. */
export function usersPart(detail: SubflowDetail | undefined, names: ReadonlyMap<string, string>, open: (partId: string, key: string) => void, context: LibraryViewContext, openFlow?: (flow: { flowId: string; name: string }) => void): HTMLElement | undefined {
  if (detail === undefined) return undefined;
  const flowCallers = detail.callers.flatMap((caller) => (caller.kind === "flow" ? [caller] : []));
  const flows = flowCallers.length;
  const children: HTMLElement[] = [];
  if (flows > 0) children.push(createElement("p", { text: flows === 1 ? "1 automation uses it." : `${flows} automations use it.` }));
  // Each automation by name, opening it when the host can, with the note that a newer version of this subflow passed.
  if (flowCallers.some((caller) => caller.flowId !== undefined)) {
    const list = createElement("ul", { className: "library-lines" });
    flowCallers.forEach((caller, at) => {
      const name = caller.name ?? "An automation";
      const key = `flow/${at}:${caller.flowId ?? ""}`;
      const flowId = caller.flowId;
      const label =
        openFlow !== undefined && flowId !== undefined
          ? createElement("button", { className: "library-link", text: name, attrs: { type: "button" } })
          : createElement("span", { text: name });
      if (openFlow !== undefined && flowId !== undefined) {
        label.addEventListener("click", () => openFlow({ flowId, name }));
        context.register(key, label);
      }
      const item = createElement("li", {}, [label]);
      if (caller.newer !== undefined) item.append(createElement("p", { className: "library-note", text: caller.newer.said }));
      list.append(item);
    });
    children.push(list);
  }
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
