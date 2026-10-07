// Creates the blank Flow and saves the original instruction, then authors an unverified candidate.
// Successful authoring never applies topology or makes the Flow executable.

import { automationStudioConversationCommandText } from "./argument.ts";
import { buildAutomationStudioFlowFromConversation } from "./build.ts";
import type { AutomationStudioConversationCommand } from "./command.ts";
import { automationStudioConversationCallCause, automationStudioConversationCommandProgress } from "./progress.ts";

const TITLE = "Create an automation here";
const NAME_MAX = 80;

export const AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE: AutomationStudioConversationCommand = {
  background: true,
  capability: {
    id: "flow.createHere",
    title: TITLE,
    summary: "Makes a new Flow that does what the person asks, explores the page they have open to work out the steps, and saves a candidate draft with verification pending.",
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
  announce: ({ place }) => `I'll make you a new automation for this, working out its steps by trying them on ${place}. I'll say here when the draft is saved; it will still need verification.`,
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
    // A build that failed leaves the Flow it was making empty, and the ending
    // says so in place of the steps that landed: "Before that I created the
    // Flow ... and saved what it should do", read straight after "I could not
    // build this Flow", said the opposite of what had happened (t195,
    // `run-murdouox-c5294247`, UI review).
    if (!built.ok) return progress.failed(built.cause, { ending: built.ending, left: automationStudioConversationCreateHereLeft(name, built) });
    return { ...progress.succeeded("Saved a candidate draft. Verification pending; the Flow's steps are unchanged."), candidate: built.candidate };
  }
};

/**
 * A new Flow's name, from the opening words of what it should do: cut after
 * its last whole word that fits, never inside one (t276, `run-muw6144a-e56f945d`
 * ended "The Flow "Go through my friend requests and confirm everyone I have
 * at least five mutua..." keeps your instruction").
 */
function automationStudioConversationFlowName(instruction: string): string {
  const firstLine = instruction.split(/\r?\n/u)[0] ?? instruction;
  const sentence = (firstLine.split(/(?<=[.!?])\s/u)[0] ?? firstLine).trim();
  if (sentence.length <= NAME_MAX) return sentence;
  const room = sentence.slice(0, NAME_MAX - 2);
  const space = room.lastIndexOf(" ");
  const cut = space > NAME_MAX / 2 ? room.slice(0, space) : sentence.slice(0, NAME_MAX - 3);
  return `${cut.replace(/[\s,;:.-]+$/u, "")}...`;
}

/**
 * What a failed build left, said once, true, and as one plain sentence.
 *
 * t193 R2-C3 (live run `run-murzln6g-11debe1d`): the ending said "The Flow so
 * far was kept, and building again carries on from it", and this sentence then
 * called the Flow empty. The Flow holds no step either way; what differs is
 * whether the build kept the steps it found as a draft to carry on from. When
 * it did and its own ending already said so, this names only the Flow and the
 * instruction it keeps: the ending's kept sentence is the one place that says
 * what was kept and that building again carries on from it (t193 round 1003,
 * `run-musp4h2f-72e8ed99`: "What is left: the Flow ..." under that sentence
 * named the Flow, not what was left). When it gave no ending, this says what
 * was kept. When nothing was kept, the Flow has no steps.
 *
 * t195 `run-musp474o-e0ed7432` (12-failure-panel): "What is left: the Flow
 * "...", with what you asked saved on it" read as a label rather than something
 * a person is told, so each variant is a sentence of its own.
 */
function automationStudioConversationCreateHereLeft(name: string, built: { ending?: string | undefined; kept: boolean }): string {
  if (!built.kept) return `The Flow "${name}" has no steps yet, but it keeps your instruction, so you can build it again.`;
  if (built.ending) return `The Flow "${name}" keeps your instruction.`;
  return `The Flow "${name}" keeps your instruction, and the steps found so far were kept as a draft, so building it again carries on from them.`;
}
