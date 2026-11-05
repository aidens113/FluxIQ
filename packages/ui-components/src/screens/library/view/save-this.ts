import { createElement } from "../../../dom/index.ts";
import type { SubflowLibraryPort, SubflowSaveQuery } from "../port.ts";
import { saveWords } from "../words/index.ts";

const COULD_NOT = "That could not be saved. Try again.";

/**
 * A plain "Save this" for one subflow of a Flow, to be mounted wherever a Flow's subflow is shown (the build's
 * plan, a task's details). It asks the library to keep it and says what happened in words: kept, already kept, or
 * Core's own reason it could not be. Nothing is drawn when the client's port cannot save. The button is held
 * while a save is under way and stays pressable after a refusal, so the person can try again.
 */
export function saveThis(port: Pick<SubflowLibraryPort, "save">, query: SubflowSaveQuery, buttonClass = "library-secondary"): HTMLElement | undefined {
  if (port.save === undefined) return undefined;
  const save = port.save.bind(port);
  const button = createElement("button", { className: buttonClass, text: "Save this", attrs: { type: "button" } });
  const said = createElement("p", { attrs: { role: "status" } });
  let saving = false;
  const press = async (): Promise<void> => {
    if (saving) return;
    saving = true;
    button.disabled = true;
    said.textContent = "Saving...";
    try {
      const answer = await save(query);
      said.textContent = answer.ok ? saveWords(answer.value) : answer.sentence;
      if (answer.ok && !("refused" in answer.value) && answer.value.saved) button.textContent = "Saved";
    } catch {
      // The port promises never to throw; this only keeps the person from a button stuck on "Saving...", and tells them.
      said.textContent = COULD_NOT;
    } finally {
      saving = false;
      button.disabled = button.textContent === "Saved";
    }
  };
  button.addEventListener("click", () => void press());
  return createElement("div", { className: "library-save" }, [button, said]);
}
