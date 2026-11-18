// The one shared AI-key card, in plain DOM like the humanness slider, for any client to mount.
//
//   [Ready]  Anthropic is ready, using Work key.                       [Change model]
//
// It shows the key's state (`modelAccessWords`) with one action. Add a key, Paste it again and Replace key open
// an inline form (`model-key-form.ts`); "Save and check" moves the card to checking and then to the new state,
// in place. Remove is one inline confirm (`model-key-remove.ts`). Change model, Try now, How to update and the
// host's own "Open FluxIQ" go to `onAction`. The card reads and writes only through the `ModelKeysPort`; a
// pasted value is cleared from the form once it is sent and is never kept, logged or drawn.

import { createElement } from "../../dom/index.ts";
import { MODEL_ACCESS_CHECKING, modelAccessWords } from "../words.ts";
import type { ModelAccessState } from "../state.ts";
import { createModelKeyForm, type ModelKeyForm } from "./form.ts";
import type { ModelKeyProvider } from "./providers.ts";
import { createModelKeyRemove, type ModelKeyRemove } from "./remove.ts";
import type { ModelKeysPort } from "./port.ts";

/** What the host does for the card. `open-fluxiq` is offered where the client cannot write a key yet. */
export type ModelKeyHostAction = "change-model" | "try-now" | "how-to-update" | "open-fluxiq";

/** What a host supplies. */
export type ModelKeyCardOptions = {
  port: ModelKeysPort;
  /** `compact` for the chat's empty state, `full` for a settings page (it also offers Remove). */
  variant: "full" | "compact";
  providers: readonly ModelKeyProvider[];
  onAction(action: ModelKeyHostAction): void;
  /** Hears each state the card reads (null: not known yet), so a host can show the card only when it matters. */
  onState?(state: ModelAccessState | null): void;
};

/** The mounted card. */
export type ModelKeyCard = {
  readonly element: HTMLElement;
  /** Reads the state again and draws it. */
  refresh(): Promise<void>;
  destroy(): void;
};

const COULD_NOT_READ = "Couldn't check your AI key just now.";
const ADD_IN_FLUXIQ = "Add it in FluxIQ for now.";
const FAILED = "Something went wrong. Try again.";

/** Creates the card and starts reading the state. */
export function createModelKeyCard(options: ModelKeyCardOptions): ModelKeyCard {
  const { port } = options;
  const badge = createElement("span", { className: "model-key-badge", hidden: true });
  const line = createElement("p", { className: "model-key-line", attrs: { role: "status" } });
  const action = createElement("button", { className: "model-key-action", attrs: { type: "button" }, hidden: true });
  const removeLink = createElement("button", { className: "model-key-remove-link", text: "Remove", attrs: { type: "button" }, hidden: true });
  const slot = createElement("div", { className: "model-key-slot" });
  const element = createElement("div", { className: "model-key-card", attrs: { "data-variant": options.variant, "data-state": "checking" } }, [
    createElement("div", { className: "model-key-head" }, [badge, line]),
    createElement("div", { className: "model-key-buttons" }, [action, removeLink]),
    slot
  ]);
  let state: ModelAccessState | null = null;
  let keyId: string | undefined;
  let checking = "";
  let note = "";
  let form: ModelKeyForm | null = null;
  let confirm: ModelKeyRemove | null = null;
  let reads = 0;
  let gone = false;
  let unsubscribe: (() => void) | undefined;

  const words = () => (state === null ? null : modelAccessWords(state));
  const keyName = (): string | undefined => (state !== null && "keyName" in state ? state.keyName : undefined);

  function draw(): void {
    const shown = words();
    const busy = checking !== "";
    element.setAttribute("data-state", busy || state === null ? "checking" : state.kind);
    if (shown === null || busy) {
      badge.hidden = true;
      line.textContent = busy ? checking : note !== "" ? note : MODEL_ACCESS_CHECKING;
    } else {
      badge.hidden = false;
      badge.textContent = shown.badge;
      badge.setAttribute("data-tone", shown.tone);
      line.textContent = note !== "" ? note : shown.sentence;
    }
    const idle = !busy && form === null && confirm === null;
    action.hidden = !(idle && shown !== null);
    if (shown !== null) action.textContent = shown.action.label;
    removeLink.hidden = !(idle && options.variant === "full" && keyId !== undefined && keyName() !== undefined);
    if (confirm === null && form === null && slot.childNodes.length > 0) slot.replaceChildren();
  }

  function open(mode: "add" | "replace"): void {
    confirm = null;
    form = createModelKeyForm({ providers: options.providers, mode, requiresPassword: port.requiresPassword, onSave: () => void save(mode) });
    slot.replaceChildren(form.element);
    draw();
  }

  function offerOpen(): void {
    const button = createElement("button", { className: "model-key-open", text: "Open FluxIQ", attrs: { type: "button" } });
    button.addEventListener("click", () => options.onAction("open-fluxiq"));
    form?.offer(button);
  }

  async function save(mode: "add" | "replace"): Promise<void> {
    const current = form;
    if (current === null) return;
    const values = current.values();
    if (values.value === "") return current.problem("Paste your key first.");
    if (port.requiresPassword && values.password === "") return current.problem("Enter your FluxIQ password.");
    if (!port.canWrite) {
      current.problem(ADD_IN_FLUXIQ);
      return offerOpen();
    }
    current.problem("");
    current.offer(null);
    current.busy(true);
    const provider = mode === "replace" ? (state !== null && "provider" in state ? state.provider : "") : values.provider.name;
    checking = provider === "" ? MODEL_ACCESS_CHECKING : `Checking with ${provider}...`;
    draw();
    const password = port.requiresPassword ? values.password : undefined;
    let saved: Awaited<ReturnType<ModelKeysPort["save"]>>;
    try {
      saved = mode === "replace" && keyId !== undefined
        ? await port.replace(keyId, values.value, password)
        : await port.save({ provider: values.provider.id, name: values.name === "" ? `${values.provider.name} key` : values.name, value: values.value, ...(password === undefined ? {} : { password }) });
    } catch {
      saved = { ok: false, message: FAILED };
    }
    if (gone) return;
    checking = "";
    current.busy(false);
    if (!saved.ok) {
      current.problem(saved.message);
      return draw();
    }
    // Sent: the value goes from the field now, whatever the check says.
    current.clear();
    form = null;
    const newId = "keyId" in saved && typeof saved.keyId === "string" ? saved.keyId : keyId;
    if (port.check !== undefined && newId !== undefined) {
      checking = MODEL_ACCESS_CHECKING;
      draw();
      try {
        await port.check(newId);
      } catch {
        /* best-effort: the state read below says what is true */
      }
      checking = "";
    }
    await refresh();
  }

  async function refresh(): Promise<void> {
    const mine = (reads += 1);
    let answer: Awaited<ReturnType<ModelKeysPort["readState"]>>;
    try {
      answer = await port.readState();
    } catch {
      answer = { ok: false, message: COULD_NOT_READ };
    }
    if (gone || mine !== reads) return;
    if (answer.ok) {
      state = answer.state;
      keyId = answer.keyId;
      note = "";
    } else note = state === null ? COULD_NOT_READ : "";
    draw();
    options.onState?.(state);
  }

  action.addEventListener("click", () => {
    const shown = words();
    if (shown === null) return;
    switch (shown.action.id) {
      case "add-key": return open("add");
      case "paste-again":
      case "replace-key": return open(keyId === undefined ? "add" : "replace");
      case "try-now": return void refresh();
      default: return options.onAction(shown.action.id);
    }
  });
  removeLink.addEventListener("click", () => {
    const name = keyName();
    const id = keyId;
    if (name === undefined || id === undefined) return;
    const asking: ModelKeyRemove = createModelKeyRemove({
      keyName: name,
      requiresPassword: port.requiresPassword,
      onKeep: () => {
        confirm = null;
        draw();
      },
      onRemove: async (password) => {
        if (port.requiresPassword && password === "") return asking.problem("Enter your FluxIQ password.");
        asking.problem("");
        asking.busy(true);
        let removed: Awaited<ReturnType<ModelKeysPort["remove"]>>;
        try {
          removed = await port.remove(id, port.requiresPassword ? password : undefined);
        } catch {
          removed = { ok: false, message: FAILED };
        }
        if (gone) return;
        asking.busy(false);
        if (!removed.ok) return asking.problem(removed.message);
        confirm = null;
        await refresh();
      }
    });
    confirm = asking;
    form = null;
    slot.replaceChildren(asking.element);
    draw();
  });

  // A pushed state is drawn at once and supersedes a read still in flight; `null` reads again.
  unsubscribe = port.subscribe?.((pushed) => {
    if (gone) return;
    if (pushed === null) return void refresh();
    reads += 1;
    state = pushed;
    note = "";
    draw();
    options.onState?.(state);
  });
  draw();
  void refresh();
  return {
    element,
    refresh,
    destroy() {
      gone = true;
      unsubscribe?.();
      form?.clear();
      element.remove();
    }
  };
}
