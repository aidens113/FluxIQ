// Where a task the model would only answer in words goes once it has been asked
// again, one rung up, and still did (t973).
//
// Never a silent stall, and never the prose question that stalled the live
// tasks. A message the model itself declared a task is a task: when the
// capability that does a described job from the open page is offered and a
// page is open, it starts there with the person's whole message as its
// instruction, as the model was told to start it (`./prompt.ts`), and any
// permission it needs is asked by FluxIQ as it starts. Anything else -- a
// reply that never declared a task, or no page to start from -- is the
// model's own reply, so the person still has an answer.

import type { AutomationStudioConversationDecision } from "./decision.ts";
import { automationStudioConversationInvocationDecision, type AutomationStudioConversationDecisionContext } from "./invocation.ts";

/** The capability that does a described job from the page the person has open (`../commands/create-here.ts`). */
const CREATE_HERE = "flow.createHere";

export function automationStudioConversationUnansweredTaskDecision(input: {
  /** The last reply the model gave. */
  reply: Extract<AutomationStudioConversationDecision, { kind: "reply" }>;
  /** Whether any of its answers declared the message a task. */
  declaredTask: boolean;
  message: string;
  context: AutomationStudioConversationDecisionContext;
}): AutomationStudioConversationDecision {
  const words = input.message.trim();
  const offered = input.context.capabilities.some((capability) => capability.id === CREATE_HERE);
  if (!input.declaredTask || !offered || !input.context.onScreen.pageUrl || !words) return input.reply;
  return automationStudioConversationInvocationDecision(CREATE_HERE, { instruction: words }, input.context, null);
}
