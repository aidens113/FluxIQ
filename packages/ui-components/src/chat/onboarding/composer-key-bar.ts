// The AI key's state above the composer, in the key card's own words and with its one action, once the chat
// has turns: an empty chat shows the card in its welcome instead. It is drawn only while the key is not
// ready, so a working key adds nothing. A reply, or a message that did not send, may come from a key that
// stopped working, so the key is read again after each new reply and each failed send (there is no push).

import { createModelKeyCard, defaultModelKeyProviders, type ModelAccessState, type ModelKeyHostAction, type ModelKeysPort } from "../../model-access/index.ts";
import { createElement } from "../../dom/index.ts";
import type { CoreTurn } from "../conversation/index.ts";

/** The mounted bar. */
export type ComposerKeyBar = {
  readonly element: HTMLElement;
  /** Takes the turns on screen: shows or hides the bar and reads the key again after a new reply or failed send. */
  update(turns: readonly CoreTurn[]): void;
  destroy(): void;
};

/** Builds the bar over `port`; the card's host actions go to `onAction`. */
export function createComposerKeyBar(port: ModelKeysPort, onAction: (action: ModelKeyHostAction) => void): ComposerKeyBar {
  let state: ModelAccessState | null = null;
  let hasTurns = false;
  let mark: string | undefined;
  const card = createModelKeyCard({
    port,
    variant: "compact",
    providers: defaultModelKeyProviders,
    onAction,
    onState: (next) => {
      state = next;
      show();
    }
  });
  const element = createElement("div", { className: "chat-key-bar", hidden: true, attrs: { role: "status" } }, [card.element]);
  function show(): void {
    const shown = hasTurns && state !== null && state.kind !== "ready";
    if (element.hidden === shown) element.hidden = !shown;
  }
  return {
    element,
    update(turns) {
      hasTurns = turns.length > 0;
      const newest = turns.at(-1);
      const reply = newest !== undefined && newest.author !== "person" ? newest.turnId : "";
      const failed = turns.filter((turn) => turn.sendError !== undefined).map((turn) => turn.turnId).join(",");
      const next = `${reply}|${failed}`;
      if (hasTurns && next !== mark) {
        mark = next;
        void card.refresh();
      }
      show();
    },
    destroy: () => card.destroy()
  };
}
