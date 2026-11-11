// What a turn's attachment refers to, from Core. A turn carries only
// `{ kind, ref }`, so something has to resolve the reference before the chat
// can draw it. Core answers `{ attachment: { attachment, payload } }`; the chat
// unwraps that itself.
//
// A project thread's turn is read in the thread's own project
// (`get-conversation-attachment`). A panel thread belongs to no project, so the
// context's project is the literal `panel`, which names nothing: its turn is
// read through `get-panel-thread-attachment`, which takes the project holding
// what the reference names (a proposed Flow change) from the host, the project
// the person has open. A reference that needs none (a navigation) is read
// without one, and Core says so itself when a proposal is read with none.

import type { ChatAttachmentContext, ChatResult } from "@fluxiq/ui-components";
import { getConversationAttachment } from "../../automation-studio/conversation";
import type { ProgramCommandTransport } from "../../automation-studio/data/program-transport";
import { chatResult } from "../transport";

const PANEL_PROJECT = "panel";

export type ReadAttachmentOptions = {
  /** Present: the chat is the panel-wide assistant, whose threads are read through the panel's own endpoint. */
  panel?: { openProjectId(): string | undefined };
};

export function readAttachment(api: ProgramCommandTransport, options: ReadAttachmentOptions = {}): (context: ChatAttachmentContext) => Promise<ChatResult<unknown>> {
  return async (context) => {
    if (options.panel) {
      const projectId = realProject(context.projectId) ?? realProject(options.panel.openProjectId());
      return chatResult(await api.post("get-panel-thread-attachment", {
        conversationId: context.conversationId,
        turnId: context.turnId,
        ...(projectId === undefined ? {} : { projectId })
      }));
    }
    return chatResult(await getConversationAttachment(api, {
      projectId: context.projectId,
      conversationId: context.conversationId,
      turnId: context.turnId
    }));
  };
}

function realProject(projectId: string | undefined | null): string | undefined {
  const id = projectId?.trim();
  return id && id !== PANEL_PROJECT ? id : undefined;
}
