// An answer to a question Core asked in a turn, over `answer-ask`.
//
// The answer goes out flat, as Core's handler reads it (`askId`, `kind`,
// `value`), with the PIN only when the person just re-authorized it. After a
// granted confirmation Core raised before a delete or a payment, the panel
// runs exactly the invocation that turn carried, with that PIN, and nothing
// else: an ask raised for any other reason carries no invocation and runs
// nothing here.

import type { ChatAnswer, ChatResult } from "@fluxiq/ui-components";
import {
  CONVERSATION_PANEL_CAPABILITY_ATTACHMENT,
  commitConversationChanged,
  conversationCapabilityArguments,
  conversationPanelInvocation,
  runConversationCapability
} from "../../automation-studio/conversation";
import type { ProgramCommandTransport } from "../../automation-studio/data/program-transport";
import { chatResult } from "./chat-result";
import type { ProgramChatTransportOptions } from "./options";
import { projectFor } from "./project-for";

const UNREADABLE_CONFIRMATION = "That confirmation did not say what to run, so nothing was done. Ask for it again.";
const RUN_FAILED = "Your answer was taken, but running what it confirmed failed. Ask for it again.";

export async function answerAsk(
  api: ProgramCommandTransport,
  options: Pick<ProgramChatTransportOptions, "projectId" | "onScreen">,
  answer: ChatAnswer
): Promise<ChatResult<unknown>> {
  const project = projectFor(answer.projectId, options);
  if (!project.ok) return project.failure;
  const { projectId } = project;
  const pin = answer.authorizationPin;
  const taken = chatResult(await api.post("answer-ask", {
    projectId,
    askId: answer.askId,
    kind: answer.kind,
    ...(typeof answer.value === "string" ? { value: answer.value } : {}),
    ...(pin ? { authorizationPin: pin } : {})
  }));
  if (!taken.ok) return taken;

  const turn = answer.turn;
  let problem: string | undefined;
  if (answer.kind === "grant" && turn?.attachment?.kind === CONVERSATION_PANEL_CAPABILITY_ATTACHMENT) {
    const invocation = conversationPanelInvocation({ attachment: turn.attachment });
    if (!invocation) problem = UNREADABLE_CONFIRMATION;
    else {
      try {
        await runConversationCapability(api, {
          conversationId: turn.conversationId,
          request: { capabilityId: invocation.capabilityId, arguments: conversationCapabilityArguments(invocation.arguments) },
          context: { projectId, ...options.onScreen?.(), ...(pin ? { authorizationPin: pin } : {}) }
        });
      } catch {
        problem = RUN_FAILED;
      }
    }
  }
  if (turn) commitConversationChanged({ projectId, conversationId: turn.conversationId });
  if (problem === undefined) return taken;
  const value = taken.value && typeof taken.value === "object" ? taken.value : {};
  return { ok: true, value: { ...value, problem } };
}
