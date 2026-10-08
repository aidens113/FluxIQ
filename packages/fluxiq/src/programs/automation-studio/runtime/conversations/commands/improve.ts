// "It should also ...": improving a Flow that already has steps.
//
// The panel's `flow.improve`, run by Core. What the person said -- their own
// message, as written, never the chat model's rewording (`./argument.ts`,
// t349) -- is saved as a required generation instruction on the Flow (the panel's
// `saveFlowImprovementInstruction`), because the build reads the Flow's active
// instructions and nothing else; the Flow is then amended from the live site
// with Core's `extend`. Unlike a build onto a blank Flow, this change replaces
// steps the person already has, so it is not applied on their behalf: the
// thread asks "apply this change?", and a yes applies it
// (`confirmed.ts`, `adaptation.apply`).
//
// In candidate authoring mode (`./build.ts`) Core test-runs the amended Flow
// once from its start. A proposal it makes from a confirmed yes is asked about
// exactly as a legacy one; a draft leaves the steps unchanged, asks nothing,
// and the answer says what its test run came to.

import { AUTOMATION_STUDIO_CONVERSATION_ARGUMENT_WORDS, automationStudioConversationCommandInstruction, automationStudioConversationCommandText } from "./argument.ts";
import { AUTOMATION_STUDIO_CONVERSATION_CANDIDATE_JUDGED, automationStudioConversationAuthorsCandidates, automationStudioConversationCandidateDraftSaid, buildAutomationStudioFlowFromConversation } from "./build.ts";
import type { AutomationStudioConversationCommand } from "./command.ts";
import { automationStudioConversationCallCause, automationStudioConversationCommandProgress } from "./progress.ts";

const TITLE = "Improve a Flow that already has steps";
const INSTRUCTION_TITLE_OPENING = 70;

export const AUTOMATION_STUDIO_CONVERSATION_IMPROVE: AutomationStudioConversationCommand = {
  background: true,
  capability: {
    id: "flow.improve",
    title: TITLE,
    get summary() {
      return automationStudioConversationAuthorsCandidates()
        ? "Says what an existing Flow should do differently, amends its steps on the real website, test-runs the amended Flow once from its start, and asks the person whether to apply the change only when that test is judged to do what was asked."
        : "Says what an existing Flow should do differently, then amends its steps on the real website into a change the person is asked to apply.";
    },
    group: "Flows",
    control: "Improve automation",
    arguments: [
      { name: "flowId", describe: "The Flow it is about.", required: true },
      { name: "change", describe: "What the Flow should do differently. Core saves the person's own message as written in its place; this is used only when no message from the person started the request.", required: true }
    ],
    phrases: ["improve the flow", "change what it does", "make it also handle", "it should also", "fix it so that", "teach it to"],
    consequences: ["modify_existing"],
    reauthorizes: false
  },
  // An improvement is built from the Flow as it is, not from the page open now (`build.ts`), so no page is named.
  announce: ({ flowName }) => `I'll work out the change${flowName ? ` to "${flowName}"` : ""} by trying it on the website, then ${automationStudioConversationAuthorsCandidates() ? "test-run the changed Flow once from its start and ask you here whether to apply it" : "ask you here whether to apply it"}.`,
  async run(context, args) {
    const progress = automationStudioConversationCommandProgress(TITLE, context.keyLocked);
    const flowId = automationStudioConversationCommandText(args, "flowId");
    if (!flowId) return progress.failed("I could not tell which Flow it is about");
    const said = await automationStudioConversationCommandInstruction(context, AUTOMATION_STUDIO_CONVERSATION_IMPROVE.capability, args, "change");
    if (!said) return progress.failed("I was not told what should change");
    progress.carry({ flowId });

    const saved = await context.port.call("save-flow-instruction", { projectId: context.projectId, flowId, ...automationStudioImprovementInstruction(said.text) });
    if (!saved.ok) return progress.failed(automationStudioConversationCallCause("saving what should change", saved));
    progress.carry({ instructionFrom: said.from });
    progress.landed(said.from === "person" ? "saved what should change as an instruction on the Flow" : `saved what should change as an instruction on the Flow, ${AUTOMATION_STUDIO_CONVERSATION_ARGUMENT_WORDS}`);

    const built = await buildAutomationStudioFlowFromConversation(context, { flowId, mode: "extend" });
    if (!built.ok) return progress.failed(built.cause, { ending: built.ending, kept: built.candidateKept });
    if (built.status === "draft") return { ...progress.succeeded(automationStudioConversationCandidateDraftSaid(built.candidate)), candidate: built.candidate };
    progress.carry({ adaptationId: built.adaptationId });
    return {
      ...progress.succeeded(`Worked out the change on the website${built.trial ? `, and ${AUTOMATION_STUDIO_CONVERSATION_CANDIDATE_JUDGED}` : ""}. It is waiting for you to say whether to apply it.`),
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
