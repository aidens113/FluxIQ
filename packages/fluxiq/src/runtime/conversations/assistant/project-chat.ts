// What a project's conversation needs to know of the panel assistant (t1095): every chat belongs to a
// project, so the panel's chat is a project conversation, and these say which of its parts are the
// assistant's. The program side wires them to its endpoints (`programs/automation-studio/api/panel-assistant/project-chat.ts`).
//
// - `offered`: the vocabulary a panel caller's message offers, with Core's `panel.assistant` command beside
//   the panel's capabilities, so anything else a person can do in the panel is handed to the assistant. A
//   caller that may not have it (a paired client) gets its vocabulary unchanged.
// - `isCard`: an ask the assistant raised as an Allow card (`ask.assistant.`), answered by the assistant.
// - `isStep`: an attachment one of the assistant's steps carries that the project's own resolver cannot read:
//   a navigation, or a reference into another project, read as a panel thread's would be.

import { AUTOMATION_STUDIO_CONVERSATION_PANEL_ASSISTANT } from "../commands/index.ts";
import type { AutomationStudioConversationAttachment } from "../turn.ts";
import { PANEL_ASSISTANT_CARD_ASK_PREFIX, PANEL_ASSISTANT_CLIENT_ACTION_ATTACHMENT } from "./loop/index.ts";

export const panelAssistantProjectParts = Object.freeze({
  /** The vocabulary a message sent, with the hand-off to the assistant added when `offer` is true. */
  offered(capabilities: readonly unknown[], offer: boolean): unknown[] {
    if (!offer) return [...capabilities];
    const offered = AUTOMATION_STUDIO_CONVERSATION_PANEL_ASSISTANT.capability;
    if (capabilities.some((capability) => (capability as { id?: unknown } | null)?.id === offered.id)) return [...capabilities];
    return [...capabilities, { ...offered, arguments: [...offered.arguments], phrases: [...offered.phrases], consequences: [...offered.consequences] }];
  },

  isCard(askId: unknown): askId is string {
    return typeof askId === "string" && askId.startsWith(PANEL_ASSISTANT_CARD_ASK_PREFIX);
  },

  isStep(attachment: AutomationStudioConversationAttachment): boolean {
    return attachment.kind === PANEL_ASSISTANT_CLIENT_ACTION_ATTACHMENT || attachment.ref.startsWith("{");
  }
});
