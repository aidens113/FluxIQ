// "Automate this": a new Flow, built from the page the person has open.
//
// Four registry calls, each the one the panel makes for the same step: create
// the Flow, save what it should do as its generation instruction, explore the
// site from the page on screen and build from what worked, and apply the
// change. Applying is safe to do without asking because the Flow is brand new
// and blank: there is nothing of the person's for the change to replace.
//
// What it should do is the person's own message, as written (`./argument.ts`,
// t349): the chat model decides that a Flow is made, never what it is told.
//
// In candidate authoring mode (`./build.ts`) Core test-runs the candidate once
// from its start. A proposal it makes from a confirmed yes is applied here as a
// legacy one is; a candidate that stayed a draft is never applied, and the
// answer says what its test run came to.

import { applyAutomationStudioConversationAdaptation } from "./apply.ts";
import { AUTOMATION_STUDIO_CONVERSATION_ARGUMENT_WORDS, automationStudioConversationCommandInstruction, automationStudioConversationCommandText, type AutomationStudioConversationCommandInstruction } from "./argument.ts";
import { AUTOMATION_STUDIO_CONVERSATION_CANDIDATE_JUDGED, automationStudioConversationAuthorsCandidates, automationStudioConversationCandidateDraftSaid, buildAutomationStudioFlowFromConversation } from "./build.ts";
import type { AutomationStudioConversationCommand } from "./command.ts";
import { automationStudioConversationSiteName } from "../site-name.ts";
import { automationStudioConversationCallCause, automationStudioConversationCommandProgress } from "./progress.ts";

const TITLE = "Create an automation here";
const NAME_MAX = 80;

export const AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE: AutomationStudioConversationCommand = {
  background: true,
  capability: {
    id: "flow.createHere",
    title: TITLE,
    get summary() {
      return automationStudioConversationAuthorsCandidates()
        ? "Makes a new Flow that does what the person asks, explores the page they have open to work out the steps, test-runs the whole Flow once from its start, and puts the steps into the Flow only when that test is judged to do what was asked."
        : "Makes a new Flow that does what the person asks, explores the page they have open to work out the steps, and puts those steps into the Flow.";
    },
    group: "Flows",
    control: "",
    arguments: [
      { name: "instruction", describe: "What the automation should do. Core saves the person's own message as written in its place; this is used only when no message from the person started the request.", required: true },
      { name: "name", describe: "What to call the new Flow. Left out, it is named from the instruction.", required: false }
    ],
    phrases: ["automate this", "automate this page", "create an automation", "make a flow for this page", "build me a flow that", "create a flow that"],
    consequences: ["create_new"],
    reauthorizes: false
  },
  announce: ({ place }) => automationStudioConversationAuthorsCandidates()
    ? `I'll make you a new automation for this, working out its steps by trying them on ${place} and then test-running the whole Flow once from the start. I'll say here when it is ready, or why it is not.`
    : `I'll make you a new automation for this, working out its steps by trying them on ${place}. I'll say here when it is ready.`,
  async run(context, args) {
    const progress = automationStudioConversationCommandProgress(TITLE, context.keyLocked);
    const said = await automationStudioConversationCommandInstruction(context, AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE.capability, args, "instruction");
    if (!said) return progress.failed("I was not told what the automation should do");
    const instruction = said.text;
    const name = automationStudioConversationCommandText(args, "name") || automationStudioConversationFlowName(instruction);

    const created = await context.port.call("create-flow", { projectId: context.projectId, name });
    const flowId = (created.payload as { flow?: { flowId?: unknown } } | undefined)?.flow?.flowId;
    if (!created.ok || typeof flowId !== "string" || !flowId) return progress.failed(automationStudioConversationCallCause("creating the Flow", created.ok ? { ok: false, error: "Core answered without the new Flow's id" } : created));
    progress.carry({ flowId });
    progress.landed(`created the Flow "${name}"`);

    const saved = await context.port.call("save-flow-generation-instruction", { projectId: context.projectId, flowId, authSessionId: context.sessionId, instruction });
    if (!saved.ok) return progress.failed(automationStudioConversationCallCause("saving what it should do", saved));
    progress.carry({ instructionFrom: said.from });
    progress.landed(said.from === "person" ? "saved what it should do" : `saved what it should do, ${AUTOMATION_STUDIO_CONVERSATION_ARGUMENT_WORDS}`);

    const built = await buildAutomationStudioFlowFromConversation(context, { flowId, mode: "create" });
    // A build that failed leaves the Flow it was making empty, and the ending
    // says so in place of the steps that landed: "Before that I created the
    // Flow ... and saved what it should do", read straight after "I could not
    // build this Flow", said the opposite of what had happened (t195,
    // `run-murdouox-c5294247`, UI review).
    if (!built.ok) return progress.failed(built.cause, { ending: built.ending, left: automationStudioConversationCreateHereLeft(name, built, said.from) });
    if (built.status === "draft") return { ...progress.succeeded(automationStudioConversationCandidateDraftSaid(built.candidate)), candidate: built.candidate };
    progress.carry({ adaptationId: built.adaptationId });
    const where = automationStudioConversationSiteName(context.startLocation);
    progress.landed(built.trial ? `explored ${where}, wrote the Flow's steps and test-ran the whole Flow from its start` : `tried the steps on ${where} and worked out which ones work`);
    if (built.awaitingPermission) return progress.failed("the build finished still waiting for your permission for one of its steps, so its steps were not put into the Flow");

    const applied = await applyAutomationStudioConversationAdaptation(context, { flowId, adaptationId: built.adaptationId });
    if (!applied.ok) return progress.failed(applied.cause);
    // True whether or not a run follows, and one may already be under way when
    // this is read (the Lab starts one as soon as it is written), so it says
    // what is so rather than telling the person to start one (UI D9).
    return progress.succeeded(built.trial
      ? `Your automation "${name}" is ready: I explored ${where}, wrote its steps, and ${AUTOMATION_STUDIO_CONVERSATION_CANDIDATE_JUDGED}.`
      : `Your automation "${name}" is ready: I tried its steps on ${where} and put the ones that worked into it.`);
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
 *
 * The instruction is "yours" only when it is the person's own message; the
 * argument a caller with no person turn gave is said to be the request's (t349).
 *
 * A candidate build that failed after writing its steps says what it kept --
 * the latest version as a draft, and how its test runs came out -- in place of
 * "has no steps yet" (t362, `run-muyrpbnk-fef374e7`).
 */
function automationStudioConversationCreateHereLeft(name: string, built: { ending?: string | undefined; kept: boolean; candidateKept?: string | undefined }, from: AutomationStudioConversationCommandInstruction["from"]): string {
  const instruction = from === "person" ? "your instruction" : `the instruction ${AUTOMATION_STUDIO_CONVERSATION_ARGUMENT_WORDS}`;
  // A candidate build's draft is never carried on from, and is not "no steps" either (t362, round 4's C6).
  if (built.candidateKept) return `${built.candidateKept} The Flow "${name}" keeps ${instruction}, so you can build it again.`;
  if (!built.kept) return `The Flow "${name}" has no steps yet, but it keeps ${instruction}, so you can build it again.`;
  if (built.ending) return `The Flow "${name}" keeps ${instruction}.`;
  return `The Flow "${name}" keeps ${instruction}, and the steps found so far were kept as a draft, so building it again carries on from them.`;
}
