// What a turn carries beside its words, for a host that can draw it
// (`ChatAttachmentPort`).
//
// The degradation is the point. The turn gives only `{ kind, ref }`, so a chat
// that cannot resolve a reference neither invents a payload nor drops the
// attachment silently: it names what the turn carries and, where the host can,
// offers to open it.
//
//   drawn          the host's drawer made an element from the resolved payload
//   reading        a drawer and a read exist and the read is on its way:
//                  "Reading <kind>..."
//   failed         the read failed or the drawer could not take it:
//                  "<Kind> could not be read here."
//   kept outside   no drawer, or no way to read: "<Kind>, kept outside this
//                  conversation."
//
// The three reference states show a paperclip, the reference in `<code>` and,
// when the host can open it, an Open button. The view belongs to its turn: it
// reads once, when it is made, and a re-read of the thread (which keeps the
// turn's view) neither reads nor redraws it. A read that lands after the
// thread it was for has gone (`place.current()` is false) is dropped.

import { createElement } from "../../dom/index.ts";
import { lucideIcon } from "../../icons/index.ts";
import type { ChatAttachment, ChatAttachmentDraw, ChatAttachmentPort } from "../ports/index.ts";

/** Which turn the attachment is on, and whether the thread it was read in is still the one on screen. */
export type AttachmentPlace = { projectId: string; conversationId: string; turnId: string; current(): boolean };

/** The mounted attachment. */
export type AttachmentView = { readonly element: HTMLElement };

type Shown = "reading" | "failed" | "kept" | "drawn";

/** Creates the view for `attachment` and, when it can be drawn, starts its one read. */
export function createAttachmentView(port: ChatAttachmentPort, attachment: ChatAttachment, place: AttachmentPlace | undefined): AttachmentView {
  const drawer = port.drawer(attachment.kind);
  const label = port.label(attachment.kind);
  const element = createElement("div", { className: "chat-attachment" });
  const ready = drawer !== null && port.read !== undefined && place !== undefined ? { drawer, place } : undefined;
  const show = (state: Shown): void => {
    element.setAttribute("data-state", state);
    if (state === "drawn") return;
    const words = state === "failed" ? `${label} could not be read here.`
      : state === "reading" ? `Reading ${label.toLowerCase()}...`
        : `${label}, kept outside this conversation.`;
    const open = port.open === undefined || port.canOpen?.() === false ? [] : [openButton(port, attachment)];
    element.replaceChildren(
      lucideIcon("paperclip", 14),
      createElement("span", { className: "chat-attachment-words", text: words }),
      createElement("code", { className: "chat-attachment-ref", text: attachment.ref }),
      ...open
    );
  };
  show(ready === undefined ? "kept" : "reading");
  if (ready !== undefined) {
    // Drawn when the read lands; a read or a drawer that fails leaves the reference, saying it could not be read.
    void resolveAndDraw(port, ready.drawer, attachment, ready.place).then(
      (drawn) => {
        if (!ready.place.current()) return;
        show("drawn");
        element.replaceChildren(drawn);
      },
      () => {
        /* best-effort: the reason stays out of the chat; the turn itself says it could not be read here */
        if (ready.place.current()) show("failed");
      }
    );
  }
  return { element };
}

/** Reads the attachment and draws what it resolved to; rejects when either cannot. */
async function resolveAndDraw(port: ChatAttachmentPort, drawer: ChatAttachmentDraw, attachment: ChatAttachment, place: AttachmentPlace): Promise<HTMLElement> {
  const result = await port.read!({ attachment, projectId: place.projectId, conversationId: place.conversationId, turnId: place.turnId });
  const payload = result.ok ? resolvedPayload(result.value) : undefined;
  if (payload === undefined) throw new Error("the attachment could not be read");
  return drawer(payload, attachment);
}

function openButton(port: ChatAttachmentPort, attachment: ChatAttachment): HTMLElement {
  const button = createElement("button", { className: "small-button", text: "Open", attrs: { type: "button" } });
  button.addEventListener("click", () => port.open?.(attachment));
  return button;
}

/**
 * Core answers `{ attachment: { attachment, payload } }`: the reference it
 * resolved, and what it resolved to. The drawer wants the second. A value that
 * is not wrapped is passed through, so a host may hand over the thing itself.
 */
function resolvedPayload(value: unknown): unknown {
  const outer = isRecord(value) && "attachment" in value ? value.attachment : value;
  return isRecord(outer) && "payload" in outer && "attachment" in outer ? outer.payload : outer;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
