// "Try it on the website": build a Flow by exploring the site.
//
// The panel's `flow.explore`, run by Core, with two things the chat adds: what
// the person just said is saved first when they said it, and the page they
// have open is where the exploration starts. The build is Core's `create`
// mode, which Core accepts only on a blank Flow, so a change it produced has
// nothing of the person's to replace and is applied straight away -- the same
// reason create-here applies. A Flow that already has steps is refused by the
// build itself, and the thread says so; improving one is `flow.improve`.

import { applyAutomationStudioConversationAdaptation } from "./apply.ts";
import { automationStudioConversationCommandText } from "./argument.ts";
import { buildAutomationStudioFlowFromConversation } from "./build.ts";
import type { AutomationStudioConversationCommand } from "./command.ts";
import { automationStudioConversationPageShown } from "./page.ts";
import { automationStudioConversationCallCause, automationStudioConversationCommandProgress } from "./progress.ts";

const TITLE = "Build the Flow by exploring the site";

export const AUTOMATION_STUDIO_CONVERSATION_EXPLORE: AutomationStudioConversationCommand = {
  background: true,
  capability: {
    id: "flow.explore",
    title: TITLE,
    summary: "Opens the real website, works out what the Flow's instruction needs, builds the Flow from what actually worked, and puts it into a Flow that has no steps yet.",
    group: "Flows",
    control: "Explore and build",
    arguments: [
      { name: "flowId", describe: "The Flow it is about.", required: true },
      { name: "instruction", describe: "What the Flow should do, when the person says it now. Left out, the Flow's saved instruction is used.", required: false }
    ],
    phrases: ["explore the site", "try it on the website", "work it out live", "build it by exploring"],
    consequences: ["modify_existing"],
    reauthorizes: false
  },
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
    if (!built.ok) return progress.failed(built.cause);
    progress.carry({ adaptationId: built.adaptationId });
    const where = automationStudioConversationPageShown(context.startLocation) ?? "the site";
    progress.landed(`explored ${where} and worked out the steps`);
    if (built.awaitingPermission) return progress.failed("the build finished still waiting for your permission for one of its steps, so its steps were not put into the Flow");

    const applied = await applyAutomationStudioConversationAdaptation(context, { flowId, adaptationId: built.adaptationId });
    if (!applied.ok) return progress.failed(applied.cause);
    return progress.succeeded(`Explored ${where} and put the steps that worked into the Flow. Say "run it" to try it.`);
  }
};
