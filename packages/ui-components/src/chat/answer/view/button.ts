// A real button with a name, for the answer turn's actions.

import { createElement } from "../../../dom/index.ts";

/** A button saying `words`; `name` is its longer accessible name where the words alone are not enough. */
export function answerButton(words: string, action: string, onPress: () => void, options: { tone?: "primary" | "danger"; name?: string; disabled?: boolean; expanded?: boolean } = {}): HTMLButtonElement {
  const attrs: Record<string, string> = { type: "button", "data-action": action };
  if (options.name !== undefined) attrs["aria-label"] = options.name;
  if (options.tone !== undefined) attrs["data-tone"] = options.tone;
  if (options.expanded !== undefined) attrs["aria-expanded"] = String(options.expanded);
  const button = createElement("button", { className: "small-button", text: words, attrs });
  if (options.disabled === true) button.disabled = true;
  button.addEventListener("click", onPress);
  return button;
}
