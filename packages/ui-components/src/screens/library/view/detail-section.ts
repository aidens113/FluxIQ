import { createElement, type ElementChild } from "../../../dom/index.ts";

/** One headed part of the details. */
export function detailSection(title: string, children: readonly ElementChild[]): HTMLElement {
  return createElement("section", { className: "library-section" }, [createElement("h3", { className: "library-section-title", text: title }), ...children]);
}
