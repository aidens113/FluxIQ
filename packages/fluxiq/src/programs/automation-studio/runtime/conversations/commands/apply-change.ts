// "Yes, apply it": the change an improvement worked out, put into its Flow.
//
// Not offered to the model. It runs only from a granted confirmation that a
// conversation command wrote (`confirmed.ts`), whose attachment names the Flow
// and the exact change, so a yes applies what the person was shown and nothing
// else. The id is the panel's own, so a reader of the thread recognises it.

import { applyAutomationStudioConversationAdaptation } from "./apply.ts";
import { automationStudioConversationCommandText } from "./argument.ts";
import type { AutomationStudioConversationCommand } from "./command.ts";
import { automationStudioConversationCommandProgress } from "./progress.ts";

const TITLE = "Accept a suggested change into the Flow";

export const AUTOMATION_STUDIO_CONVERSATION_APPLY_CHANGE: AutomationStudioConversationCommand = {
  background: false,
  capability: {
    id: "adaptation.apply",
    title: TITLE,
    summary: "Accepts a change FluxIQ suggested and applies it, so the Flow has it from its next run.",
    group: "Versions",
    control: "Apply Changes",
    arguments: [
      { name: "flowId", describe: "The Flow it is about.", required: true },
      { name: "adaptationId", describe: "The suggested change.", required: true }
    ],
    phrases: [],
    consequences: ["modify_existing"],
    reauthorizes: false
  },
  async run(context, args) {
    const progress = automationStudioConversationCommandProgress(TITLE, context.keyLocked);
    const flowId = automationStudioConversationCommandText(args, "flowId");
    const adaptationId = automationStudioConversationCommandText(args, "adaptationId");
    if (!flowId || !adaptationId) return progress.failed("the confirmation did not say which change to apply");
    progress.carry({ flowId, adaptationId });
    const applied = await applyAutomationStudioConversationAdaptation(context, { flowId, adaptationId });
    if (!applied.ok) {
      if (applied.approved) progress.landed("accepted the change");
      return progress.failed(applied.cause);
    }
    return progress.succeeded("Applied the change. The Flow uses it from its next run.");
  }
};
