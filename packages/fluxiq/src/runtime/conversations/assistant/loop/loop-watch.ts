// Core's loop detection (Answer First, D14: `runtime/llm/repeat-guard/loop-detection/`)
// watching the assistant, as the user asked for every agent role: "If an agent
// keeps doing the same thing over and over that needs to be detected and
// steered/stopped".
//
// The detector and its ladder are reused unchanged; this only says what a panel
// call is in its terms. A call's context is the thread. Its "page" is what it
// answered: a tool that answers something new has moved the work on, and one
// that answers the same again has not. A read is a look, a change that ran is
// an act that landed, a refused call is a refusal, and a consequential call is
// a lasting act, so the same deletion twice is caught however the answers look.
//
// The ladder: the first finding steers (the model is told, the person sees a
// step); a further call that continues it is refused before it runs; and when
// refusing has not worked, the signal is due and the message stops and says so.
// The assistant has no fresh context to start, so either signal stops it.

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import {
  automationStudioLlmLoopChatWords,
  automationStudioLlmLoopDigest,
  automationStudioLlmLoopRefusalInstruction,
  automationStudioLlmLoopSteerNote,
  automationStudioLlmLoopWatch,
  type AutomationStudioLlmLoopFinding,
  type AutomationStudioLlmLoopSignal
} from "../../../llm/repeat-guard/index.ts";

/** One call that ran, as the watch is told it. */
export type PanelAssistantWatchedCall = {
  callId: string;
  toolId: string;
  input: JsonObject;
  /** What it answered, whole: its digest is the state it left. */
  answer: JsonValue;
  /** It may change something (any class but `read`). */
  mutate: boolean;
  /** It is a consequential act (send, money, delete, security). */
  lasting: boolean;
  /** It was refused or failed. */
  refused: boolean;
};

/** What the person sees and the model is told about a finding. */
export type PanelAssistantLoopNotice = { chat: { title: string; text: string }; model: string };

export type PanelAssistantLoopWatch = {
  /** Before a call runs: why it is refused unrun, or undefined to run it. */
  before(toolId: string, input: JsonObject): PanelAssistantLoopNotice | undefined;
  /** After a call ran: the steer, or undefined. */
  after(call: PanelAssistantWatchedCall): PanelAssistantLoopNotice | undefined;
  /** Refusing has not worked: the signal that stops the message, or undefined. */
  due(): AutomationStudioLlmLoopSignal | undefined;
};

/** A watch for one message of one thread. */
export function panelAssistantLoopWatch(conversationId: string): PanelAssistantLoopWatch {
  const watch = automationStudioLlmLoopWatch({ refuseActs: true });
  const context = `panel-assistant:${conversationId}`;
  const notice = (finding: AutomationStudioLlmLoopFinding, model: string): PanelAssistantLoopNotice => ({ chat: automationStudioLlmLoopChatWords(finding), model });
  return {
    before(toolId, input) {
      const finding = watch.check(toolId, input, context, undefined);
      return finding ? notice(finding, automationStudioLlmLoopRefusalInstruction(finding, "undrafted")) : undefined;
    },
    after(call) {
      const state = automationStudioLlmLoopDigest(call.answer);
      const finding = watch.ran({
        callId: call.callId,
        toolId: call.toolId,
        input: call.input,
        context,
        stateAfter: state,
        answer: state,
        effect: call.mutate ? "mutate" : "observe",
        effectApplied: call.mutate && !call.refused,
        refused: call.refused,
        lasting: call.lasting
      });
      return finding ? notice(finding, JSON.stringify(automationStudioLlmLoopSteerNote(finding, "undrafted"))) : undefined;
    },
    due: () => watch.due()
  };
}
