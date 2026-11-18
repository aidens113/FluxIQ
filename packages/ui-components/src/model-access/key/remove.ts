// The key card's one inline confirm for Remove: the sentence, the account password where the host needs it,
// and Remove / Keep it. Nothing is removed until Remove is pressed.

import { createElement } from "../../dom/index.ts";

/** What the confirm needs. */
export type ModelKeyRemoveOptions = {
  keyName: string;
  requiresPassword: boolean;
  /** Remove was pressed, with the password the person typed. */
  onRemove(password: string): void;
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
  const password = createElement("input", { className: "model-key-input", attrs: { type: "password", name: "password", autocomplete: "current-password", placeholder: "Your FluxIQ password" }, hidden: !options.requiresPassword });
  const problem = createElement("p", { className: "model-key-problem", hidden: true, attrs: { role: "alert" } });
  const remove = createElement("button", { className: "model-key-remove-confirm", text: "Remove", attrs: { type: "button" } });
  const keep = createElement("button", { className: "model-key-keep", text: "Keep it", attrs: { type: "button" } });
  remove.addEventListener("click", () => options.onRemove(password.value));
  keep.addEventListener("click", () => options.onKeep());
  const element = createElement("div", { className: "model-key-remove" }, [
    createElement("p", { className: "model-key-remove-line", text: `Remove ${options.keyName}? FluxIQ will need a new AI key to build.` }),
    password,
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
      password.disabled = on;
    }
  };
}
