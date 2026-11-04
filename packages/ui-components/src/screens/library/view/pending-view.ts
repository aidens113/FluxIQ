import { createElement } from "../../../dom/index.ts";
import type { LibraryViewContext } from "./view-context.ts";
import { viewHeader } from "./view-header.ts";

/** A subflow that is not in the list and is still being read, or could not be: Back, and a quiet line with Try again. */
export function pendingView(problem: string | undefined, hooks: { back(): void; retry(): void }, context: LibraryViewContext): HTMLElement {
  const root = createElement("div", { className: "library-detail" }, [viewHeader("Subflow", hooks.back, context)]);
  if (problem === undefined) {
    root.append(createElement("p", { className: "library-quiet", text: "Reading it..." }));
    return root;
  }
  const retry = createElement("button", { className: "library-link", text: "Try again", attrs: { type: "button" } });
  retry.addEventListener("click", hooks.retry);
  root.append(createElement("p", { className: "library-note", attrs: { role: "status" } }, [`${problem} `, retry]));
  return root;
}
