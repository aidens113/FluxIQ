import { createElement } from "../../../dom/index.ts";
import type { LibraryViewContext } from "./view-context.ts";

/** The top of a detail or run view: Back, and what it is about. */
export function viewHeader(title: string, back: () => void, context: LibraryViewContext, line?: string): HTMLElement {
  const button = createElement("button", { className: "library-back", text: "‹ Back", attrs: { type: "button" } });
  button.addEventListener("click", back);
  context.register("back", button);
  return createElement("header", { className: "library-header" }, [
    button,
    createElement("h2", { className: "library-title", text: title }),
    ...(line === undefined || line === "" ? [] : [createElement("p", { className: "library-title-line", text: line })])
  ]);
}
