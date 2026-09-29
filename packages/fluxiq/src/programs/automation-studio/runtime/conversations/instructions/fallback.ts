// Acting on the words when no model could read them.
//
// A model that is not connected, or that timed out three times, must not leave
// the person's message unanswered, and must not stop the chat window operating
// the panel. So Core matches the words itself: a declared phrase found in the
// message, or the capability whose id, title and phrases account for most of
// what was said once the Flow's own name is set aside. A confident match runs,
// and the thread says it was matched without the model, so a wrong reading is
// visible and correctable. Anything less confident is answered in words with
// the way forward, never silence.

import { automationStudioClosestName, automationStudioNameWords } from "./closest.ts";
import type { AutomationStudioConversationDecision } from "./decision.ts";
import { automationStudioConversationFlowMentioned, automationStudioConversationFlowWords } from "./flows.ts";
import { automationStudioConversationInvocationDecision, type AutomationStudioConversationDecisionContext } from "./invocation.ts";

/** Below this, a match on the words alone is not acted on. */
export const AUTOMATION_STUDIO_CONVERSATION_FALLBACK_FLOOR = 0.5;

const ASKING_WHAT = /\b(?:what|which)\b[\s\S]{0,40}\b(?:can|could)\b[\s\S]{0,20}\b(?:you|i)\b|^\s*(?:help|commands?|capabilities)\s*\??\s*$/iu;

export function automationStudioConversationFallbackDecision(
  message: string,
  context: AutomationStudioConversationDecisionContext
): AutomationStudioConversationDecision {
  if (ASKING_WHAT.test(message)) return { kind: "reply", text: whatICanDo(context) };
  if (!context.capabilities.length) {
    return { kind: "reply", text: "The control panel did not tell me what it can do this time, so I cannot act on that from here. The controls themselves still work." };
  }
  const flowWords = automationStudioConversationFlowWords(context.flows ?? []);
  const asked = automationStudioNameWords(message).filter((word) => !flowWords.has(word)).join(" ");
  const said = ` ${automationStudioNameWords(message).join(" ")} `;
  let best: { id: string; confidence: number } | null = null;
  for (const capability of context.capabilities) {
    let confidence = automationStudioClosestName(asked, [{ key: capability.id, labels: [capability.title, ...capability.phrases] }])?.confidence ?? 0;
    for (const phrase of capability.phrases) {
      const words = automationStudioNameWords(phrase);
      if (words.length && said.includes(` ${words.join(" ")} `)) confidence = Math.max(confidence, 0.7 + Math.min(0.25, words.length * 0.06));
    }
    if (!best || confidence > best.confidence) best = { id: capability.id, confidence };
  }
  if (!best || best.confidence < AUTOMATION_STUDIO_CONVERSATION_FALLBACK_FLOOR) {
    return {
      kind: "reply",
      text: 'I could not tell what you wanted done from that on my own. Put it as something to do, such as "run the kettle flow", or ask "what can you do?" and I will list everything.'
    };
  }
  const mentioned = context.flows ? automationStudioConversationFlowMentioned(message, context.flows) : null;
  const decision = automationStudioConversationInvocationDecision(best.id, mentioned ? { flowId: mentioned.flowId } : {}, context, null);
  if (decision.kind === "invoke") decision.invocation.confidence = best.confidence;
  return decision;
}

function whatICanDo(context: AutomationStudioConversationDecisionContext): string {
  if (!context.capabilities.length) return "The control panel did not tell me what it can do this time. The controls themselves still work.";
  const groups = new Map<string, string[]>();
  for (const capability of context.capabilities) {
    const titles = groups.get(capability.group) ?? [];
    titles.push(capability.title);
    groups.set(capability.group, titles);
  }
  const lines = [...groups].map(([group, titles]) => `${group}: ${titles.join(", ")}.`);
  return [`I can do ${context.capabilities.length} things in this panel from here:`, ...lines, "Tell me what you want in your own words."].join("\n");
}
