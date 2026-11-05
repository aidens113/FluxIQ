import { createElement } from "../../../dom/index.ts";

/** A plain list of lines. */
export function lines(items: readonly string[]): HTMLElement {
  return createElement("ul", { className: "library-lines" }, items.map((item) => createElement("li", { text: item })));
}
