// The key card's one inline confirm for Remove: the sentence and Remove / Keep it. One press removes the key;
// nothing is removed until it. A key needs no password.

import { createElement } from "../../dom/index.ts";

/** What the confirm needs. */
export type ModelKeyRemoveOptions = {
  keyName: string;
  /** Remove was pressed. */
  onRemove(): void;
  /** Keep it was pressed. */
  onKeep(): void;
};

/** The mounted confirm. */
export type ModelKeyRemove = {
  readonly element: HTMLElement;
  problem(message: string): void;
  busy(on: boolean): void;
};

/** Creates the confirm. */
export function createModelKeyRemove(options: ModelKeyRemoveOptions): ModelKeyRemove {
  const problem = createElement("p", { className: "model-key-problem", hidden: true, attrs: { role: "alert" } });
  const remove = createElement("button", { className: "model-key-remove-confirm", text: "Remove", attrs: { type: "button" } });
  const keep = createElement("button", { className: "model-key-keep", text: "Keep it", attrs: { type: "button" } });
  remove.addEventListener("click", () => options.onRemove());
  keep.addEventListener("click", () => options.onKeep());
  const element = createElement("div", { className: "model-key-remove" }, [
    createElement("p", { className: "model-key-remove-line", text: `Remove ${options.keyName}? FluxIQ will need a new AI key to build.` }),
    createElement("div", { className: "model-key-buttons" }, [remove, keep]),
    problem
  ]);
  return {
    element,
    problem(message) {
      problem.textContent = message;
      problem.hidden = message === "";
    },
    busy(on) {
      remove.disabled = on;
      keep.disabled = on;
    }
  };
}
