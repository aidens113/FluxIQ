// "It should also ...": improving a Flow that already has steps.
//
// The panel's `flow.improve`, run by Core. What the person said is saved as a
// required generation instruction on the Flow (the panel's
// `saveFlowImprovementInstruction`), because the build reads the Flow's active
// instructions and nothing else; the Flow is then amended from the live site
// with Core's `extend`. Unlike a build onto a blank Flow, this change replaces
// steps the person already has, so it is not applied on their behalf: the
// thread asks "apply this change?", and a yes applies it
// (`confirmed.ts`, `adaptation.apply`).

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
    summary: "Says what an existing Flow should do differently, then amends its steps on the real website into a change the person is asked to apply.",
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
    if (!built.ok) return progress.failed(built.cause);
    progress.carry({ adaptationId: built.adaptationId });
    return {
      ...progress.succeeded("Worked out the change on the website. It is waiting for you to say whether to apply it."),
      confirm: {
        text: "Apply this change to the Flow? It changes the Flow's steps from its next run. Say yes to apply it, or no to leave the Flow as it is.",
        capabilityId: "adaptation.apply",
        arguments: { flowId, adaptationId: built.adaptationId },
        consequences: ["modify_existing"],
        control: "Apply the suggested change"
      }
    };
  }
};

/** What a person said should change, as the instruction Core stores: required, tagged for generation, titled by its opening words. */
function automationStudioImprovementInstruction(text: string): { title: string; body: string; requirement: "required"; tags: ["generation"] } {
  const firstLine = text.split(/\r?\n/u)[0] ?? text;
  const sentence = (firstLine.split(/(?<=[.!?])\s/u)[0] ?? firstLine).trim();
  const opening = sentence.length > INSTRUCTION_TITLE_OPENING ? `${sentence.slice(0, INSTRUCTION_TITLE_OPENING - 3).trimEnd()}...` : sentence;
  return { title: `Improvement: ${opening}`, body: text, requirement: "required", tags: ["generation"] };
}
