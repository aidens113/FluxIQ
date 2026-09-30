// "No, don't apply it": the change an improvement worked out, set aside.
//
// A Flow holds at most one change waiting for review, and a build refuses to
// start while one is there (`flow_bootstrap.pending_adaptation_exists`). So a
// "no" that left the change waiting would quietly block the person's next
// "improve it" with a refusal they never saw coming. Found by the extension
// chat's end-to-end test on 2026-09-30: an improvement declined, then asked
// for again, failed at the build. The change is rejected instead, which keeps
// its record and leaves the Flow as it was.
//
// Not offered to the model. It runs only from a denied confirmation that a
// conversation command wrote (`confirmed.ts`), for the exact change it named.

import { automationStudioConversationCommandText } from "./argument.ts";
import type { AutomationStudioConversationCommand } from "./command.ts";
import { automationStudioConversationCallCause, automationStudioConversationCommandProgress } from "./progress.ts";

const TITLE = "Set a suggested change aside";

export const AUTOMATION_STUDIO_CONVERSATION_DISCARD_CHANGE: AutomationStudioConversationCommand = {
  background: false,
  capability: {
    id: "adaptation.reject",
    title: TITLE,
    summary: "Rejects a change FluxIQ suggested, so the Flow stays as it was and can be improved again.",
    group: "Versions",
    control: "Reject",
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
    if (!flowId || !adaptationId) return progress.failed("the question did not say which change it was about");
    progress.carry({ flowId, adaptationId });
    const rejected = await context.port.call("review-flow-adaptation", {
      projectId: context.projectId,
      flowId,
      adaptationId,
      action: "reject",
      reason: "The person said no to applying it in the chat."
    });
    if (!rejected.ok) return progress.failed(automationStudioConversationCallCause("setting the change aside", rejected));
    return progress.succeeded("Left the Flow as it was and set the change aside. Tell me what should be different and I will work it out again.");
  }
};
