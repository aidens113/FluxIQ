// The inline form of the key card: Provider, Key (masked, with "Where do I get one?") and Name (optional); one
// button, "Save and check" (and Cancel where the host can take the form back). A key needs no password. Replace
// keeps the key's provider and name, so it asks for the key alone. The form holds the pasted value only in its
// field and clears it on `clear()`; nothing else keeps it.

import { createElement } from "../../dom/index.ts";
import { defaultModelKeyProviders, type ModelKeyProvider } from "./providers.ts";

/** What the form hands the card on Save. */
export type ModelKeyFormValues = { provider: ModelKeyProvider; name: string; value: string };

/** What the form needs to draw itself. */
export type ModelKeyFormOptions = {
  providers: readonly ModelKeyProvider[];
  /** `replace` asks for the key alone. */
  mode: "add" | "replace";
  /** Save and check was pressed. */
  onSave(): void;
  /** Given, the form shows a Cancel button that calls it. */
  onCancel?(): void;
};

/** The mounted form. */
export type ModelKeyForm = {
  readonly element: HTMLElement;
  values(): ModelKeyFormValues;
  /** Forgets the pasted value. */
  clear(): void;
  /** Shows what went wrong under the button; "" lifts it. */
  problem(message: string): void;
  /** Locks the fields and the button while a save is being checked. */
  busy(on: boolean): void;
  /** Puts a second button after the problem (the host's own way to add the key). */
  offer(button: HTMLElement | null): void;
};

let counter = 0;

/** Creates the form. */
export function createModelKeyForm(options: ModelKeyFormOptions): ModelKeyForm {
  const providers = options.providers.length > 0 ? options.providers : defaultModelKeyProviders;
  const id = `model-key-${(counter += 1)}`;
  const provider = createElement("select", { id: `${id}-provider`, className: "model-key-input", attrs: { name: "provider" } },
    providers.map((item) => createElement("option", { text: item.label, attrs: { value: item.id } })));
  provider.value = providers[0]!.id;
  const value = createElement("input", { id: `${id}-value`, className: "model-key-input", attrs: { type: "password", name: "key", autocomplete: "off", spellcheck: "false", placeholder: "Paste your key" } });
  const link = createElement("a", { className: "model-key-link", text: "Where do I get one?", attrs: { target: "_blank", rel: "noopener noreferrer", href: providers[0]!.keyUrl } });
  const name = createElement("input", { id: `${id}-name`, className: "model-key-input", attrs: { type: "text", name: "name", autocomplete: "off", placeholder: `${providers[0]!.name} key` } });
  const problem = createElement("p", { className: "model-key-problem", hidden: true, attrs: { role: "alert" } });
  const offered = createElement("div", { className: "model-key-offer", hidden: true });
  const save = createElement("button", { className: "model-key-save", text: "Save and check", attrs: { type: "button" } });
  const cancel = createElement("button", { className: "model-key-keep", text: "Cancel", attrs: { type: "button" }, hidden: options.onCancel === undefined });
  const selected = (): ModelKeyProvider => providers.find((item) => item.id === provider.value) ?? providers[0]!;
  const field = (labelText: string, control: HTMLElement, extra?: HTMLElement) => createElement("div", { className: "model-key-field" }, [
    createElement("label", { className: "model-key-label", text: labelText, attrs: { for: control.id } }),
    control,
    ...(extra === undefined ? [] : [extra])
  ]);
  provider.addEventListener("change", () => {
    const now = selected();
    link.setAttribute("href", now.keyUrl);
    name.setAttribute("placeholder", `${now.name} key`);
  });
  const submit = () => options.onSave();
  save.addEventListener("click", submit);
  cancel.addEventListener("click", () => options.onCancel?.());
  value.addEventListener("keydown", (event) => { if ((event as KeyboardEvent).key === "Enter") submit(); });
  const fields = [
    ...(options.mode === "add" ? [field("Provider", provider)] : []),
    field("Key", value, link),
    ...(options.mode === "add" ? [field("Name (optional)", name)] : [])
  ];
  const element = createElement("div", { className: "model-key-form", attrs: { "data-mode": options.mode } }, [...fields, createElement("div", { className: "model-key-buttons" }, [save, cancel]), problem, offered]);
  const inputs = [provider, value, name];
  return {
    element,
    values: () => ({ provider: selected(), name: name.value.trim(), value: value.value.trim() }),
    clear() {
      value.value = "";
    },
    problem(message) {
      if (problem.textContent !== message) problem.textContent = message;
      problem.hidden = message === "";
    },
    busy(on) {
      for (const input of inputs) input.disabled = on;
      save.disabled = on;
      cancel.disabled = on;
      save.textContent = on ? "Checking..." : "Save and check";
    },
    offer(button) {
      offered.replaceChildren(...(button === null ? [] : [button]));
      offered.hidden = button === null;
    }
  };
}
