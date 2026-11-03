// The notice under the chat once reading it from FluxIQ has kept failing
// (`../controller.ts` sets `readError` only then): the sentence naming what
// failed, and a Retry that reads again at once. Hidden otherwise, so a read
// that fails once and succeeds on its quiet retry never shows anything.

import { createElement } from "../../../dom/index.ts";
import type { ConversationState } from "../controller.ts";

/** The mounted notice. */
export type ReadNotice = { readonly element: HTMLElement; render(state: ConversationState): void };

/** Creates the notice; `retry` is the controller's. */
export function createReadNotice(retry: () => void): ReadNotice {
  const text = createElement("span", { className: "chat-read-notice-text" });
  const button = createElement("button", { className: "link-button chat-read-retry", text: "Retry", attrs: { type: "button" } });
  button.addEventListener("click", () => retry());
  const element = createElement("div", { className: "notice chat-read-notice", hidden: true, attrs: { role: "status" } }, [text, button]);
  return {
    element,
    render(state) {
      const shown = state.readError !== undefined;
      if (element.hidden === shown) element.hidden = !shown;
      if (!shown) return;
      if (text.textContent !== state.readError) text.textContent = state.readError ?? "";
      const label = state.reading ? "Retrying..." : "Retry";
      if (button.textContent !== label) button.textContent = label;
      button.disabled = state.reading;
    }
  };
}
