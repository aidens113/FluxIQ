// Explores for a candidate on the existing blank Flow, preserving its original instruction.
// The saved candidate still requires independent execution, verification and promotion.

import { automationStudioConversationCommandText } from "./argument.ts";
import { buildAutomationStudioFlowFromConversation } from "./build.ts";
import type { AutomationStudioConversationCommand } from "./command.ts";
import { automationStudioConversationCallCause, automationStudioConversationCommandProgress } from "./progress.ts";

const TITLE = "Build the Flow by exploring the site";

export const AUTOMATION_STUDIO_CONVERSATION_EXPLORE: AutomationStudioConversationCommand = {
  background: true,
  capability: {
    id: "flow.explore",
    title: TITLE,
    summary: "Builds a Flow that has no applied steps yet, or continues its compatible saved unfinished draft, then saves a candidate draft with verification pending.",
    group: "Flows",
    control: "Explore and build",
    arguments: [
      { name: "flowId", describe: "The Flow it is about.", required: true },
      { name: "instruction", describe: "A genuinely changed goal, when the person asks for one. Omit it to continue using the saved goal; changed instructions may make old draft evidence incompatible.", required: false }
    ],
    phrases: ["explore the site", "try it on the website", "work it out live", "build it by exploring", "continue building it", "finish the unfinished flow", "build it again"],
    consequences: ["modify_existing"],
    reauthorizes: false
  },
  announce: ({ flowName, place }) => `I'll work out ${flowName ? `the steps for "${flowName}"` : "the Flow's steps"} by trying them on ${place}, and save an unverified candidate draft.`,
  async run(context, args) {
    const progress = automationStudioConversationCommandProgress(TITLE, context.keyLocked);
    const flowId = automationStudioConversationCommandText(args, "flowId");
    if (!flowId) return progress.failed("I could not tell which Flow it is about");
    progress.carry({ flowId });

    const instruction = automationStudioConversationCommandText(args, "instruction");
    if (instruction) {
      const saved = await context.port.call("save-flow-generation-instruction", { projectId: context.projectId, flowId, authSessionId: context.sessionId, instruction });
      if (!saved.ok) return progress.failed(automationStudioConversationCallCause("saving what it should do", saved));
      progress.landed("saved what it should do");
    }

    const built = await buildAutomationStudioFlowFromConversation(context, { flowId, mode: "create" });
    if (!built.ok) return progress.failed(built.cause, { ending: built.ending });
    return { ...progress.succeeded("Saved a candidate draft. Verification pending; the Flow's steps are unchanged."), candidate: built.candidate };
  }
};
