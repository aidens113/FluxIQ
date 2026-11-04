import { createElement } from "../../../../dom/index.ts";

/** A button of the result, which runs `press` when pressed. */
export function resultButton(text: string, className: string, press: () => void): HTMLElement {
  const made = createElement("button", { className, text, attrs: { type: "button" } });
  made.addEventListener("click", press);
  return made;
}
