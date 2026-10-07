// Saves the requested improvement alongside original instructions and authors a candidate.
// Existing steps stay unchanged; there is no apply confirmation before verification.

import { automationStudioConversationCommandText } from "./argument.ts";
import { buildAutomationStudioFlowFromConversation } from "./build.ts";
import type { AutomationStudioConversationCommand } from "./command.ts";
import { automationStudioConversationCallCause, automationStudioConversationCommandProgress } from "./progress.ts";

const TITLE = "Improve a Flow that already has steps";
const INSTRUCTION_TITLE_OPENING = 70;

export const AUTOMATION_STUDIO_CONVERSATION_IMPROVE: AutomationStudioConversationCommand = {
  background: true,
  capability: {
    id: "flow.improve",
    title: TITLE,
    summary: "Says what an existing Flow should do differently, then amends its steps on the real website into a candidate draft with verification pending.",
    group: "Flows",
    control: "Improve automation",
    arguments: [
      { name: "flowId", describe: "The Flow it is about.", required: true },
      { name: "change", describe: "What the Flow should do differently, in plain words.", required: true }
    ],
    phrases: ["improve the flow", "change what it does", "make it also handle", "it should also", "fix it so that", "teach it to"],
    consequences: ["modify_existing"],
    reauthorizes: false
  },
  // An improvement is built from the Flow as it is, not from the page open now (`build.ts`), so no page is named.
  announce: ({ flowName }) => `I'll work out the change${flowName ? ` to "${flowName}"` : ""} by trying it on the website, then save an unverified candidate draft.`,
  async run(context, args) {
    const progress = automationStudioConversationCommandProgress(TITLE, context.keyLocked);
    const flowId = automationStudioConversationCommandText(args, "flowId");
    const change = automationStudioConversationCommandText(args, "change");
    if (!flowId) return progress.failed("I could not tell which Flow it is about");
    if (!change) return progress.failed("I was not told what should change");
    progress.carry({ flowId });

    const saved = await context.port.call("save-flow-instruction", { projectId: context.projectId, flowId, ...automationStudioImprovementInstruction(change) });
    if (!saved.ok) return progress.failed(automationStudioConversationCallCause("saving what should change", saved));
    progress.landed("saved what should change as an instruction on the Flow");

    const built = await buildAutomationStudioFlowFromConversation(context, { flowId, mode: "extend" });
    if (!built.ok) return progress.failed(built.cause, { ending: built.ending });
    return { ...progress.succeeded("Saved a candidate draft. Verification pending; the Flow's steps are unchanged."), candidate: built.candidate };
  }
};

/** What a person said should change, as the instruction Core stores: required, tagged for generation, titled by its opening words. */
function automationStudioImprovementInstruction(text: string): { title: string; body: string; requirement: "required"; tags: ["generation"] } {
  const firstLine = text.split(/\r?\n/u)[0] ?? text;
  const sentence = (firstLine.split(/(?<=[.!?])\s/u)[0] ?? firstLine).trim();
  const opening = sentence.length > INSTRUCTION_TITLE_OPENING ? `${sentence.slice(0, INSTRUCTION_TITLE_OPENING - 3).trimEnd()}...` : sentence;
  return { title: `Improvement: ${opening}`, body: text, requirement: "required", tags: ["generation"] };
}
