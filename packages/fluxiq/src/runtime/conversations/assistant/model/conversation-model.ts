import type { AutomationStudioConversationModel, AutomationStudioConversationModelTurn } from "../../instructions/index.ts";
import type { PanelAssistantModel, PanelAssistantModelTurn } from "../types.ts";

/** What the provider is asked last, every time: the whole thread and the steps so far are in the transcript above it. */
const NEXT = "Answer with your next decision: one JSON object, as your instructions describe.";

/**
 * The assistant's model over one of Core's chat-provider adapters (the
 * Anthropic and DeepSeek panel-command calls, `runtime/llm/*\/panel-command.ts`):
 * the same key release, bounded read, JSON answer and pricing, with the
 * assistant's own instructions. What a tool answered is sent as the panel's
 * report, which the adapters mark so the model never reads it as its own words.
 */
export function panelAssistantModelOf(model: AutomationStudioConversationModel): PanelAssistantModel {
  return {
    name: model.name,
    decide: async (request, execution) => {
      let costUsd = 0;
      try {
        const decision = await model.decide(
          { instructions: request.instructions, transcript: request.transcript.map(conversationTurn), message: NEXT, correction: null },
          { signal: execution.signal, caller: execution.caller, paid: (cost) => { costUsd += cost; } }
        );
        return { decision, costUsd };
      } catch (error) {
        // A failed call can still have been billed; the loop counts it against the allowance.
        if (costUsd > 0 && error !== null && typeof error === "object") Object.assign(error, { costUsd });
        throw error;
      }
    }
  };
}

function conversationTurn(turn: PanelAssistantModelTurn): AutomationStudioConversationModelTurn {
  if (turn.author === "person") return { author: "person", text: turn.text };
  if (turn.author === "tool") return { author: "panel", text: turn.text };
  return { author: "automation", text: turn.text };
}
