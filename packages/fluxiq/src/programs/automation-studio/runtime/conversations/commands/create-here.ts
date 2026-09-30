// "Automate this": a new Flow, built from the page the person has open.
//
// Four registry calls, each the one the panel makes for the same step: create
// the Flow, save what it should do as its generation instruction, explore the
// site from the page on screen and build from what worked, and apply the
// change. Applying is safe to do without asking because the Flow is brand new
// and blank: there is nothing of the person's for the change to replace.

import { applyAutomationStudioConversationAdaptation } from "./apply.ts";
import { automationStudioConversationCommandText } from "./argument.ts";
import { buildAutomationStudioFlowFromConversation } from "./build.ts";
import type { AutomationStudioConversationCommand } from "./command.ts";
import { automationStudioConversationPageShown } from "./page.ts";
import { automationStudioConversationCallCause, automationStudioConversationCommandProgress } from "./progress.ts";

const TITLE = "Create an automation here";
const NAME_MAX = 80;

export const AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE: AutomationStudioConversationCommand = {
  background: true,
  capability: {
    id: "flow.createHere",
    title: TITLE,
    summary: "Makes a new Flow that does what the person asks, explores the page they have open to work out the steps, and puts those steps into the Flow.",
    group: "Flows",
    control: "",
    arguments: [
      { name: "instruction", describe: "What the automation should do, in the person's own words.", required: true },
      { name: "name", describe: "What to call the new Flow. Left out, it is named from the instruction.", required: false }
    ],
    phrases: ["automate this", "automate this page", "create an automation", "make a flow for this page", "build me a flow that", "create a flow that"],
    consequences: ["create_new"],
    reauthorizes: false
  },
  async run(context, args) {
    const progress = automationStudioConversationCommandProgress(TITLE, context.keyLocked);
    const instruction = automationStudioConversationCommandText(args, "instruction");
    if (!instruction) return progress.failed("I was not told what the automation should do");
    const name = automationStudioConversationCommandText(args, "name") || automationStudioConversationFlowName(instruction);

    const created = await context.port.call("create-flow", { projectId: context.projectId, name });
    const flowId = (created.payload as { flow?: { flowId?: unknown } } | undefined)?.flow?.flowId;
    if (!created.ok || typeof flowId !== "string" || !flowId) return progress.failed(automationStudioConversationCallCause("creating the Flow", created.ok ? { ok: false, error: "Core answered without the new Flow's id" } : created));
    progress.carry({ flowId });
    progress.landed(`created the Flow "${name}"`);

    const saved = await context.port.call("save-flow-generation-instruction", { projectId: context.projectId, flowId, authSessionId: context.sessionId, instruction });
    if (!saved.ok) return progress.failed(automationStudioConversationCallCause("saving what it should do", saved));
    progress.landed("saved what it should do");

    const built = await buildAutomationStudioFlowFromConversation(context, { flowId, mode: "create" });
    if (!built.ok) return progress.failed(built.cause);
    progress.carry({ adaptationId: built.adaptationId });
    const where = automationStudioConversationPageShown(context.startLocation) ?? "the site";
    progress.landed(`explored ${where} and worked out the steps`);
    if (built.awaitingPermission) return progress.failed("the build finished still waiting for your permission for one of its steps, so its steps were not put into the Flow");

    const applied = await applyAutomationStudioConversationAdaptation(context, { flowId, adaptationId: built.adaptationId });
    if (!applied.ok) return progress.failed(applied.cause);
    return progress.succeeded(`Created the Flow "${name}", explored ${where}, and put the steps it worked out into the Flow. Say "run it" to try it.`);
  }
};

/** A new Flow's name, from the opening words of what it should do. */
function automationStudioConversationFlowName(instruction: string): string {
  const firstLine = instruction.split(/\r?\n/u)[0] ?? instruction;
  const sentence = (firstLine.split(/(?<=[.!?])\s/u)[0] ?? firstLine).trim();
  return sentence.length > NAME_MAX ? `${sentence.slice(0, NAME_MAX - 3).trimEnd()}...` : sentence;
}
