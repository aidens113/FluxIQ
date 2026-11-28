// What a project's conversation endpoints do for the panel assistant (t1095): every chat belongs to a
// project, so the panel's chat is a project conversation, and these three seams give it what the panel's own
// assistant thread had, through the assistant's machinery rather than a copy of it
// (`runtime/conversations/assistant/project-chat.ts` says which parts are the assistant's).
//
// - `vocabulary`: a panel caller's message offers Core's `panel.assistant` command; a paired client never.
// - `answer`: an Allow card the assistant raised is answered by the assistant, which runs exactly the call it
//   kept, and only for the person who raised it. A paired client is refused: the card was raised in the FluxIQ
//   panel and is answered there, so a client gains no authority from it.
// - `resolver`: a step the assistant wrote into a project's thread may carry a navigation, or a reference into
//   another project; those are read as a panel thread's are, each project decided by IAM and its domain.

import type { ConversationAnswerRequest, ConversationTurnAppendRequest } from "../../../../api-contracts/automation.ts";
import { panelAssistantAttachmentPayload, panelAssistantProjectParts as parts, type PanelAssistant } from "../../../../runtime/conversations/assistant/index.ts";
import type { AutomationStudioConversationAttachmentResolver } from "../../../../runtime/conversations/index.ts";
import type { GlobalProgramApiRegistry, ProgramApiActor, ProgramApiRequest } from "../../../_shared/api.ts";
import { panelAssistantOf } from "./panel-assistant-of.ts";
import { panelAssistantProjectAttachments, type PanelAssistantProjectReads } from "./project-attachments.ts";

const ANSWERED_IN_PANEL = "This question was asked by the FluxIQ panel's tools. Answer it in the FluxIQ panel.";

export function panelAssistantProjectChat(registry: GlobalProgramApiRegistry, service: PanelAssistantProjectReads) {
  const assistantFor = (request: ProgramApiRequest) => (request.actor && request.actor.channel !== "paired-client" ? panelAssistantOf(registry) : undefined);
  return Object.freeze({
    vocabulary: (request: ProgramApiRequest, payload: Partial<ConversationTurnAppendRequest>): Partial<ConversationTurnAppendRequest> =>
      Array.isArray(payload.capabilities) ? { ...payload, capabilities: parts.offered(payload.capabilities, assistantFor(request) !== undefined) } : payload,
    answer: (request: ProgramApiRequest, projectId: string, payload: Partial<ConversationAnswerRequest>) =>
      parts.isCard(payload.askId) ? answerCard(assistantFor(request), request, projectId, payload.askId, payload.kind) : Promise.resolve(undefined),
    resolver: (request: ProgramApiRequest, base: AutomationStudioConversationAttachmentResolver, action: string): AutomationStudioConversationAttachmentResolver =>
      async (read) => (parts.isStep(read.attachment) ? panelAssistantAttachmentPayload(read, panelAssistantProjectAttachments(registry, service, { actor: actorOf(request), scope: request.scope, action })) : base(read))
  });
}

/** The assistant's answer to one of its own cards, for the person who raised it. */
async function answerCard(assistant: PanelAssistant<ProgramApiActor> | undefined, request: ProgramApiRequest, projectId: string, askId: string, kind: unknown): Promise<{ ask: unknown }> {
  if (!assistant) throw new Error(ANSWERED_IN_PANEL);
  if (kind !== "grant" && kind !== "deny") throw new Error("An answer to the panel's tools is grant (Allow) or deny (Don't).");
  const answered = await assistant.answerInProject(actorOf(request), request.scope, { projectId, askId, kind });
  return { ask: answered.ask };
}

function actorOf(request: ProgramApiRequest): ProgramApiActor {
  if (!request.actor) throw new Error("Sign in to use this conversation.");
  return request.actor;
}
