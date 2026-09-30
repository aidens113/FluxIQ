// "This Flow should ...": saving what a Flow is built from.
//
// The panel's `flow.describe`, run by Core: one call to
// `save-flow-generation-instruction`, which is quick, so it answers in the
// request rather than in the background.

import { automationStudioConversationCommandText } from "./argument.ts";
import type { AutomationStudioConversationCommand } from "./command.ts";
import { automationStudioConversationCallCause, automationStudioConversationCommandProgress } from "./progress.ts";

const TITLE = "Say what a Flow should do";

export const AUTOMATION_STUDIO_CONVERSATION_DESCRIBE: AutomationStudioConversationCommand = {
  background: false,
  capability: {
    id: "flow.describe",
    title: TITLE,
    summary: "Writes the instruction a Flow is built from, in the person's own words.",
    group: "Flows",
    control: "Instruction",
    arguments: [
      { name: "flowId", describe: "The Flow it is about.", required: true },
      { name: "instruction", describe: "What the Flow should achieve, in plain words.", required: true }
    ],
    phrases: ["describe the flow", "tell it what to do", "set the instruction", "write the instruction", "what should this flow do"],
    consequences: ["modify_existing"],
    reauthorizes: false
  },
  async run(context, args) {
    const progress = automationStudioConversationCommandProgress(TITLE, context.keyLocked);
    const flowId = automationStudioConversationCommandText(args, "flowId");
    const instruction = automationStudioConversationCommandText(args, "instruction");
    if (!flowId) return progress.failed("I could not tell which Flow it is about");
    if (!instruction) return progress.failed("I was not told what the Flow should do");
    progress.carry({ flowId });
    const saved = await context.port.call("save-flow-generation-instruction", { projectId: context.projectId, flowId, authSessionId: context.sessionId, instruction });
    if (!saved.ok) return progress.failed(automationStudioConversationCallCause("saving what it should do", saved));
    return progress.succeeded("Saved what this Flow should do.");
  }
};
