// "Try it on the website": build a Flow by exploring the site.
//
// The panel's `flow.explore`, run by Core, with two things the chat adds: what
// the person just said is saved first when they said it, and the page they
// have open is where the exploration starts. The build is Core's `create`
// mode, which Core accepts only on a blank Flow, so a change it produced has
// nothing of the person's to replace and is applied straight away -- the same
// reason create-here applies. A Flow that already has steps is refused by the
// build itself, and the thread says so; improving one is `flow.improve`.
//
// In candidate authoring mode (`./build.ts`) Core test-runs the candidate once
// from its start; a proposal it makes from a confirmed yes is applied as a
// legacy one is, and a draft is never applied: the answer says why.

import { applyAutomationStudioConversationAdaptation } from "./apply.ts";
import { automationStudioConversationCommandText } from "./argument.ts";
import { AUTOMATION_STUDIO_CONVERSATION_CANDIDATE_TESTED, automationStudioConversationAuthorsCandidates, automationStudioConversationCandidateDraftSaid, buildAutomationStudioFlowFromConversation } from "./build.ts";
import type { AutomationStudioConversationCommand } from "./command.ts";
import { automationStudioConversationSiteName } from "../site-name.ts";
import { automationStudioConversationCallCause, automationStudioConversationCommandProgress } from "./progress.ts";

const TITLE = "Build the Flow by exploring the site";

export const AUTOMATION_STUDIO_CONVERSATION_EXPLORE: AutomationStudioConversationCommand = {
  background: true,
  capability: {
    id: "flow.explore",
    title: TITLE,
    get summary() {
      return automationStudioConversationAuthorsCandidates()
        ? "Builds a Flow that has no applied steps yet, test-runs the whole Flow once from its start, then puts the steps into that same Flow only when that test is judged to do what was asked."
        : "Builds a Flow that has no applied steps yet, or continues its compatible saved unfinished draft, then puts the completed steps into that same Flow.";
    },
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
  announce: ({ flowName, place }) => `I'll work out ${flowName ? `the steps for "${flowName}"` : "the Flow's steps"} by trying them on ${place}, ${automationStudioConversationAuthorsCandidates() ? "test-run the whole Flow once from the start, and say here when they are in, or why not" : "and say here when they are in"}.`,
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
    if (built.status === "draft") return { ...progress.succeeded(automationStudioConversationCandidateDraftSaid(built.candidate)), candidate: built.candidate };
    progress.carry({ adaptationId: built.adaptationId });
    const where = automationStudioConversationSiteName(context.startLocation);
    progress.landed(`tried the steps on ${where} and worked out which ones work`);
    if (built.awaitingPermission) return progress.failed("the build finished still waiting for your permission for one of its steps, so its steps were not put into the Flow");

    const applied = await applyAutomationStudioConversationAdaptation(context, { flowId, adaptationId: built.adaptationId });
    if (!applied.ok) return progress.failed(applied.cause);
    // Says what is so, never "say run it": a run may already be under way (UI D9).
    return progress.succeeded(`The Flow's steps are in: I tried them on ${where} and kept the ones that worked.${built.trial ? ` ${AUTOMATION_STUDIO_CONVERSATION_CANDIDATE_TESTED}` : ""}`);
  }
};
