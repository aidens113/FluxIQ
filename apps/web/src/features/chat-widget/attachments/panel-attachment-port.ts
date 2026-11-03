// What a turn carries beside its words, for this panel.
//
// Two of Core's attachment kinds are the panel operating itself and are not
// something to draw: `panel-capability` is a confirmation's invocation (an
// encoded string; the turn's words already say what it is), and
// `panel-capability-result` is the panel's record of what it just did, which
// the chat tells as FluxIQ's quiet line and never as the person's words.

import type { ChatAttachment, ChatAttachmentContext, ChatAttachmentPort, ChatResult } from "@fluxiq/ui-components";
import { CONVERSATION_PANEL_CAPABILITY_ATTACHMENT, CONVERSATION_PANEL_RESULT_ATTACHMENT } from "../../automation-studio/conversation";
import { drawFlowGraphDiff } from "./flow-graph-diff";
import { attachmentLabel } from "./labels";

export type PanelAttachmentDeps = {
  read(context: ChatAttachmentContext): Promise<ChatResult<unknown>>;
  /** Goes to what the reference names; absent where the host cannot. */
  open?(attachment: ChatAttachment): void;
  /** Whether `open` can go anywhere now: the screen the chat sits over may change while it stays open. */
  canOpen?(): boolean;
};

export function createPanelAttachmentPort(deps: PanelAttachmentDeps): ChatAttachmentPort {
  return {
    isRecord: (attachment) => attachment.kind === CONVERSATION_PANEL_RESULT_ATTACHMENT,
    isHidden: (attachment) => attachment.kind === CONVERSATION_PANEL_CAPABILITY_ATTACHMENT,
    label: attachmentLabel,
    drawer: (kind) => (kind === "flow-graph-diff" ? drawFlowGraphDiff : null),
    read: deps.read,
    ...(deps.open ? { open: deps.open } : {}),
    ...(deps.canOpen ? { canOpen: deps.canOpen } : {})
  };
}
