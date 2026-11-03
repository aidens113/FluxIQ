// What a turn's attachment refers to, from Core. A turn carries only
// `{ kind, ref }`, so something has to resolve the reference before the chat
// can draw it. Core answers `{ attachment: { attachment, payload } }`; the chat
// unwraps that itself.

import type { ChatAttachmentContext, ChatResult } from "@fluxiq/ui-components";
import { getConversationAttachment } from "../../automation-studio/conversation";
import type { ProgramCommandTransport } from "../../automation-studio/data/program-transport";
import { chatResult } from "../transport";

export function readAttachment(api: ProgramCommandTransport): (context: ChatAttachmentContext) => Promise<ChatResult<unknown>> {
  return async (context) => chatResult(await getConversationAttachment(api, {
    projectId: context.projectId,
    conversationId: context.conversationId,
    turnId: context.turnId
  }));
}
