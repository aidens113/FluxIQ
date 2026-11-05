// A real button with a name, for the tasks screen. `key` lets the screen give focus back to
// the same control after it redraws.

import { createElement } from "../../../dom/index.ts";

export type TaskButtonOptions = { tone?: "primary" | "danger"; name?: string; disabled?: boolean; expanded?: boolean };

/** A button saying `words`; `name` is its longer accessible name where the words alone are not enough. */
export function taskButton(words: string, key: string, onPress: () => void, options: TaskButtonOptions = {}): HTMLButtonElement {
  const attrs: Record<string, string> = { type: "button", "data-key": key };
  if (options.name !== undefined) attrs["aria-label"] = options.name;
  if (options.tone !== undefined) attrs["data-tone"] = options.tone;
  if (options.expanded !== undefined) attrs["aria-expanded"] = String(options.expanded);
  const button = createElement("button", { className: "small-button tasks-button", text: words, attrs });
  if (options.disabled === true) button.disabled = true;
  button.addEventListener("click", onPress);
  return button;
}
