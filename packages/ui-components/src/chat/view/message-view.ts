// One turn of the conversation, the way a chat shows it:
//
//   the person    a bubble on the right, their words as typed; a message
//                 the panel could not send says why under them
//   FluxIQ        full width on the left, no bubble: its words formatted
//                 (`parseAssistantText`) and a question's answer controls
//   a record      a quiet line on FluxIQ's side: what the host did on the
//                 person's behalf, written through their endpoint but never
//                 their words (`ChatAttachmentPort.isRecord`)
//
// A turn's attachment is drawn only with an attachment port, and only for a
// kind the host does not hide (`attachment-view.ts`); without one every turn is
// drawn by its words alone. Core's attachment is its own record of a command it
// ran or will run, which the turn's words already say, so the host decides which
// kinds add anything.
//
// The work that led to an answer is not folded into it: each step is its own
// message before it (`step-message-view.ts`).
//
// The element lives as long as the turn. Its words and controls are rebuilt
// only when their `signature` changes, so a half-typed answer keeps its text
// and focus across every poll. Its attachment view lives as long as the
// turn too: it is made once and read once.

import { createElement } from "../../dom/index.ts";
import { askControls, type AskControlsContext, type CoreTurn } from "../conversation/index.ts";
import { parseAssistantText, renderTextBlocks } from "../format/index.ts";
import type { ChatAttachmentPort } from "../ports/index.ts";
import { createAttachmentView, type AttachmentPlace, type AttachmentView } from "./attachment-view.ts";
import { placeChildren } from "./place-children.ts";
import type { TurnMeta } from "./turn-meta.ts";

/** The mounted turn. */
export type MessageView = {
  readonly element: HTMLElement;
  /** Shows `turn`; rebuilds its words and controls only when `signature` differs from the last. */
  update(turn: CoreTurn, signature: string, ask: AskControlsContext, place?: AttachmentPlace): void;
};

/** What a host adds to how a turn is drawn. */
export type MessageOptions = {
  attachments?: ChatAttachmentPort | undefined;
  meta?: TurnMeta | undefined;
};

/** Creates the view for a turn by `author` (`person` or anything else, which is FluxIQ). */
export function createMessageView(author: string, options: MessageOptions = {}): MessageView {
  const ports = options.attachments;
  const person = author === "person";
  let record: boolean | undefined;
  let content: HTMLElement | undefined;
  const element = createElement("li", { className: "chat-entry chat-msg", attrs: { "data-author": person ? "person" : "fluxiq" } });
  let shown: string | undefined;
  let attachmentKey = "";
  let attachmentView: AttachmentView | undefined;
  // Typed words in a question's text box, kept across rebuilds of the controls.
  const draft = { text: "" };

  /** The quiet line, the bubble or the answer: fixed by the first turn this view shows. */
  function frame(turn: CoreTurn): HTMLElement {
    record = turn.attachment !== undefined && ports?.isRecord?.(turn.attachment) === true;
    if (record) element.setAttribute("data-author", "fluxiq");
    const kind = record ? "chat-record" : person ? "chat-bubble" : "chat-answer";
    const made = createElement("div", { className: kind });
    element.append(...(options.meta === undefined ? [] : [turnHeader(turn, record ? "FluxIQ panel" : person ? "You" : "FluxIQ", options.meta)]), made);
    if (options.meta !== undefined && turn.createdAt !== undefined) element.title = options.meta.formatTime(turn.createdAt);
    return made;
  }

  return {
    element,
    update(turn, signature, ask, place) {
      content ??= frame(turn);
      if (signature === shown) return;
      shown = signature;
      const parts: HTMLElement[] = record
        ? [createElement("p", { className: "chat-record-text", text: turn.text })]
        : person
          ? [createElement("p", { className: "chat-bubble-text", text: turn.text })]
          : renderTextBlocks(parseAssistantText(turn.text));
      // A message this panel could not send says so on the turn itself.
      if (turn.sendError !== undefined) parts.push(createElement("p", { className: "chat-send-error", text: turn.sendError, attrs: { role: "alert" } }));
      const drawn = ports !== undefined && turn.attachment !== undefined && !record && ports.isHidden?.(turn.attachment) !== true;
      if (drawn) {
        const key = `${turn.attachment!.kind}\u0000${turn.attachment!.ref}`;
        if (key !== attachmentKey || attachmentView === undefined) {
          attachmentKey = key;
          attachmentView = createAttachmentView(ports, turn.attachment!, place);
        }
        parts.push(attachmentView.element);
      }
      if (turn.ask !== null) parts.push(askControls(turn.ask, { ...ask, draft }));
      placeChildren(content, parts);
    }
  };
}

function turnHeader(turn: CoreTurn, who: string, meta: TurnMeta): HTMLElement {
  const said = turn.createdAt === undefined ? [] : [createElement("time", { text: meta.formatTime(turn.createdAt), attrs: { datetime: new Date(turn.createdAt).toISOString() } })];
  return createElement("header", { className: "chat-sr-only" }, [createElement("strong", { text: who }), ...said]);
}
