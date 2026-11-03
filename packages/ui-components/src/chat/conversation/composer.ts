// The composer, as a chat has it: one rounded box at the bottom with the
// text and a round send button inside it.
//
//   - The box grows with what is typed, up to `MAX_LINES` lines, then scrolls.
//   - Enter sends, Shift+Enter adds a line, and nothing sends while an input
//     method is composing (`composerKeyAction`).
//   - Send is disabled while the box is empty or a message is on its way. The
//     box itself stays usable while sending, so typing and focus carry on.
//   - The words leave the box the moment they are sent: the controller shows
//     them as the person's turn at once (U5 of the run-musp39u8-9ac026ab UI
//     review: they sat here, with no bubble, while FluxIQ took the send). A
//     send that fails says so on that turn, not here, and the words come back
//     to the box to send again -- unless the person has typed, filled or
//     changed chats since, which is kept.
//   - The unsent draft is kept (`draftStorage`), so a closed popup keeps it;
//     with `keepDraft: false` it is kept in memory only (`draft-memory.ts`).
//   - With `maxLength` the box takes no more, and under `remainingHintBelow`
//     characters left it says how many (`composer-hint`).
//   - Not connected, the box is disabled and says "Connect to FluxIQ first".
//   - With nowhere to send (`setUnavailable`: no thread and no project to open
//     one on) the box is disabled and the reason stands above it, in words,
//     until the host lifts it.
//   - A described recording can ride with a message (`attachment`): a button
//     beside Send picks it, a chip names it, and it leaves the chip only once
//     a send went; a failed send keeps it.
//   - `fill` puts an example prompt in the box for the person to edit or
//     send; it never sends by itself.
//
// Nothing here is rebuilt by `render`: it writes properties of the same
// nodes, so the caret and focus survive every update.

import { createElement } from "../../dom/index.ts";
import { composerKeyAction } from "./composer-keys.ts";
import type { ConversationState } from "./controller.ts";
import type { ChatComposerOptions } from "./chat-composer-options.ts";
import { memoryDraftStorage } from "./draft-memory.ts";
import { draftStorage } from "./draft-storage.ts";
import type { ChatOwner } from "../owner-context.ts";
import type { RecordingAttachment } from "../attachment/index.ts";

/** The mounted composer. */
export type Composer = {
  readonly element: HTMLElement;
  render(state: ConversationState): void;
  focus(): void;
  /** Replaces what is in the box with `text`, keeps it as the draft, and puts the caret at its end. */
  fill(text: string): void;
  /** Says who the box writes to, as its placeholder ("Message FluxIQ"). */
  setPlaceholder(text: string): void;
  /** Binds the draft to observed context; foreign drafts require explicit adoption. */
  setOwner(owner: ChatOwner): void;
  /** Disables the box and says why above it; undefined lifts it. Takes effect at the next `render`. */
  setUnavailable(reason: string | undefined): void;
};

const PLACEHOLDER = "Message FluxIQ";
const OFFLINE_PLACEHOLDER = "Connect to FluxIQ first";
const UNAVAILABLE_PLACEHOLDER = "Chat unavailable";
/** The most lines the box grows to before it scrolls. */
const MAX_LINES = 8;
const SVG = "http://www.w3.org/2000/svg";

/** Creates the composer; `send` answers true once the words went, and gets the attached recording's id, if any. */
export function createComposer(send: (text: string, recordingId?: string) => Promise<boolean>, attachment?: RecordingAttachment, options: ChatComposerOptions = {}): Composer {
  const draft = options.keepDraft === false ? memoryDraftStorage() : draftStorage();
  const maxLength = options.maxLength;
  const box = createElement("textarea", {
    id: "conversationInput",
    className: "composer-box",
    attrs: { rows: "1", placeholder: PLACEHOLDER, "aria-label": "Message to FluxIQ", enterkeyhint: "send", ...(maxLength === undefined ? {} : { maxlength: String(maxLength) }) }
  });
  box.value = draft.read();
  const sendButton = createElement("button", {
    id: "conversationSendButton",
    className: "composer-send",
    attrs: { type: "button", "aria-label": "Send", title: options.sendHint ?? "Send (Enter)" }
  }, [arrowIcon()]);
  const parkedNotice = createElement("p", { className: "notice", text: "Review this draft before sending it in this chat.", attrs: { role: "status" } });
  let adopt = createElement("button", { className: "button", text: "Use draft here", attrs: { type: "button" } });
  let clear = createElement("button", { className: "button", text: "Clear draft", attrs: { type: "button" } });
  const unavailableLine = createElement("p", { className: "composer-unavailable", hidden: true, attrs: { role: "status" } });
  const parkedControls = createElement("div", { className: "composer-draft-review", hidden: true }, [parkedNotice, adopt, clear]);
  const hint = createElement("p", { className: "composer-hint", hidden: true, attrs: { role: "status" } });
  const fieldParts = attachment ? [box, attachment.button, sendButton] : [box, sendButton];
  const element = createElement("div", { className: "composer" }, [
    ...(attachment ? [attachment.chip, attachment.menu] : []),
    unavailableLine,
    createElement("div", { className: "composer-field" }, fieldParts),
    ...(maxLength === undefined || options.remainingHintBelow === undefined ? [] : [hint]),
    parkedControls
  ]);
  let enabled = false;
  let sending = false;
  let composing = false;
  let editRevision = 0;
  let placeholder = PLACEHOLDER;
  let owner: ChatOwner | undefined;
  let unavailable: string | undefined;
  let draftOwner: string | null = null;
  let operation: object | undefined;
  let parked = false;
  const current = () => owner === undefined || owner.current();
  function persist(): void { if (owner) draft.writeOwned(box.value, draftOwner); else draft.write(box.value); }

  function fit(): void {
    // A box not laid out (its view hidden) measures 0; it keeps its stylesheet height until it is.
    if (box.scrollHeight === 0) {
      box.style.height = "";
      return;
    }
    const style = globalThis.getComputedStyle?.(box);
    const line = Number.parseFloat(style?.lineHeight ?? "") || 20;
    const padding = (Number.parseFloat(style?.paddingTop ?? "") || 0) + (Number.parseFloat(style?.paddingBottom ?? "") || 0);
    const max = line * MAX_LINES + padding;
    box.style.height = "auto";
    const wanted = Math.min(box.scrollHeight, max);
    box.style.height = `${Math.ceil(wanted)}px`;
    box.style.overflowY = box.scrollHeight > max ? "auto" : "hidden";
  }

  function syncButton(): void {
    const disabled = !enabled || sending || operation !== undefined || parked || !current() || box.value.trim() === "";
    if (sendButton.disabled !== disabled) sendButton.disabled = disabled;
    const label = sending ? "Sending" : "Send";
    if (sendButton.getAttribute("aria-label") !== label) sendButton.setAttribute("aria-label", label);
    sendButton.dataset.sending = sending ? "true" : "false";
    parkedControls.hidden = !parked;
    box.readOnly = parked;
    attachment?.refresh();
    attachment?.setDisabled(!enabled || sending || operation !== undefined || parked || !current());
    adopt.disabled = clear.disabled = !enabled || !current();
    syncHint();
  }

  // Says how many characters are left, only once few are.
  function syncHint(): void {
    if (maxLength === undefined || options.remainingHintBelow === undefined) return;
    const left = maxLength - box.value.length;
    const shown = enabled && left < options.remainingHintBelow;
    const words = shown ? `${left.toLocaleString()} characters left.` : "";
    if (hint.textContent !== words) hint.textContent = words;
    if (hint.hidden !== !shown) hint.hidden = !shown;
  }

  function submit(): void {
    if (!enabled || sending || operation !== undefined || parked || !current() || box.value.trim() === "") return;
    const words = box.value;
    const recording = attachment?.current();
    const submittedOwner = owner;
    const submitted = {};
    operation = submitted;
    // Out of the box at once: the thread shows them as the person's turn.
    editRevision += 1;
    const sentRevision = editRevision;
    box.value = "";
    draftOwner = owner?.identity ?? null;
    persist();
    fit();
    syncButton();
    const settle = (sent: boolean): void => {
      if (operation === submitted) {
        operation = undefined;
        syncButton();
      }
      // Sent: the recording went with the words. Not sent: it stays on the chip.
      if (sent && recording !== undefined && attachment?.current()?.id === recording.id) attachment.clear();
      // Not sent: the words come back to send again, unless the box has moved
      // on since -- newer words, an example filled in, or another chat's owner.
      if (sent || submittedOwner !== owner || !current() || sentRevision !== editRevision || box.value !== "") return;
      box.value = words;
      draftOwner = owner?.identity ?? null;
      persist();
      fit();
      syncButton();
    };
    let result: Promise<boolean>;
    try { result = recording === undefined ? send(words) : send(words, recording.id); } catch { result = Promise.resolve(false); }
    void result.then(settle).catch(/* best-effort: a rejected send is a failed one; the controller owns send feedback */ () => settle(false));
  }

  sendButton.addEventListener("click", () => {
    if (!current()) return;
    submit();
    box.focus();
  });
  box.addEventListener("input", () => {
    if (!current()) return;
    editRevision += 1;
    if (!parked) draftOwner = owner?.identity ?? null;
    persist();
    fit();
    syncButton();
  });
  box.addEventListener("compositionstart", () => (composing = true));
  box.addEventListener("compositionend", () => (composing = false));
  box.addEventListener("keydown", (event) => {
    if (!current()) return;
    if (composerKeyAction(event, composing) !== "send") return;
    event.preventDefault();
    submit();
  });
  // The box has its size once it is on screen; until then the browser measures nothing.
  globalThis.requestAnimationFrame?.(fit);
  function reviewControls(captured: ChatOwner): void {
    adopt = createElement("button", { className: "button", text: "Use draft here", attrs: { type: "button" } });
    clear = createElement("button", { className: "button", text: "Clear draft", attrs: { type: "button" } });
    adopt.addEventListener("click", () => {
      if (owner !== captured || !captured.current() || !enabled || !parked) return;
      editRevision++;
      draftOwner = captured.identity;
      parked = false;
      persist();
      syncButton();
    });
    clear.addEventListener("click", () => {
      if (owner !== captured || !captured.current() || !enabled || !parked) return;
      editRevision++;
      box.value = "";
      draftOwner = captured.identity;
      parked = false;
      persist();
      fit();
      syncButton();
    });
    parkedControls.replaceChildren(parkedNotice, adopt, clear);
  }

  return {
    element,
    render(state) {
      enabled = state.mode !== "offline" && state.mode !== "fallback" && (state.scopeState === undefined || state.scopeState === "ready") && unavailable === undefined;
      sending = state.sending;
      if (box.disabled !== !enabled) box.disabled = !enabled;
      const shown = enabled ? placeholder : unavailable !== undefined ? UNAVAILABLE_PLACEHOLDER : state.mode === "offline" ? OFFLINE_PLACEHOLDER : state.scopeState === "loading" ? "Loading the conversation..." : state.scopeState === "error" ? "Chat unavailable" : OFFLINE_PLACEHOLDER;
      if (box.placeholder !== shown) box.placeholder = shown;
      syncButton();
      // A kept draft is sized once the box is on screen.
      if (box.style.height === "" && box.value !== "") fit();
    },
    focus() {
      box.focus();
      fit();
    },
    fill(text) {
      if (!current()) return;
      editRevision += 1;
      box.value = text;
      if (!parked) draftOwner = owner?.identity ?? null;
      persist();
      box.focus();
      box.setSelectionRange?.(text.length, text.length);
      fit();
      syncButton();
    },
    setPlaceholder(text) {
      placeholder = text.trim() || PLACEHOLDER;
      if (enabled && box.placeholder !== placeholder) box.placeholder = placeholder;
    },
    setUnavailable(reason) {
      unavailable = reason;
      const text = reason ?? "";
      if (unavailableLine.textContent !== text) unavailableLine.textContent = text;
      if (unavailableLine.hidden !== (reason === undefined)) unavailableLine.hidden = reason === undefined;
    },
    setOwner(next) {
      if (owner?.token === next.token) return;
      if (!owner && editRevision === 0) {
        const restored = draft.readOwned();
        box.value = restored.text;
        draftOwner = restored.owner;
      }
      owner = next;
      editRevision++;
      operation = undefined;
      reviewControls(next);
      parked = box.value !== "" && draftOwner !== next.identity;
      if (!parked) draftOwner = next.identity;
      fit();
      syncButton();
    }
  };
}

function arrowIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  for (const [name, value] of [["viewBox", "0 0 24 24"], ["width", "18"], ["height", "18"], ["aria-hidden", "true"], ["focusable", "false"]]) svg.setAttribute(name!, value!);
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2.2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("d", "M12 19V5M5.5 11.5 12 5l6.5 6.5");
  svg.append(path);
  return svg;
}
