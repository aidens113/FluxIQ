// What the model is told when a person writes.
//
// The panel's vocabulary, rendered once in Core by `panel-capabilities`, so the
// model reads the same list whichever path asked it. Then what only this moment
// knows: the project's Flows by name, and what the person has open. Then the
// answer, in three small shapes, with nothing required that Core can fill in
// itself -- a Flow may be named by its name, arguments the model does not know
// are left out, and the id need not be spelt perfectly.

import { automationStudioPanelCapabilityVocabulary } from "../../panel-capabilities/index.ts";
import { AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE, AUTOMATION_STUDIO_CONVERSATION_EXPLORE, AUTOMATION_STUDIO_CONVERSATION_IMPROVE, automationStudioConversationPageShown } from "../commands/index.ts";
import type { AutomationStudioConversationDecisionContext } from "./invocation.ts";

const ANSWER_SHAPE = [
  "Answer with one JSON object and nothing else, in one of these three shapes:",
  '  {"do": "<capability id>", "with": {"<argument>": "<value>"}}   to do something in the panel. Leave out any argument you do not know.',
  '  {"ask": "<one short question>"}   only when you cannot tell what they want, such as which of several Flows they mean.',
  '  {"reply": "<your answer>"}   when they are not asking for anything to be done, or asked what you can do.',
  "Choose the capability that does all of what was asked: when they ask for something to be run, choose the one that runs it, not one that only gets it ready.",
  "Leave projectId out: it is always this project. A Flow goes in flowId, and can be given by its name; FluxIQ finds its id. Never ask for or supply a PIN: FluxIQ asks the person for it when it is needed.",
  "Do not ask whether you may do something ordinary. Asking for it is the person's permission."
].join("\n");

/**
 * The system message for one person's message.
 *
 * `domainInstructions` is the bound domain's own text
 * (`AutomationStudioLlmEvidenceRuntimeBinding.systemInstructions`), already
 * checked when the runtime was bound. It goes after the panel's vocabulary --
 * Core's fixed list of what may be chosen -- and before what only this message
 * knows: the project's Flows and what is on screen. The answer-shape rules
 * stay last and stay Core's; nothing the domain writes replaces them. Absent,
 * the message is exactly what it was.
 */
export function automationStudioConversationInstructions(
  context: AutomationStudioConversationDecisionContext,
  notes: { transcriptWithheld: boolean; domainInstructions?: string | undefined }
): string {
  const sections = [automationStudioPanelCapabilityVocabulary(context.capabilities), ...(notes.domainInstructions ? ["", notes.domainInstructions] : []), "", flowSection(context), "", onScreenSection(context)];
  const building = buildContinuationGuidance(context);
  if (building) sections.push("", building);
  if (notes.transcriptWithheld) sections.push("", "The earlier part of this conversation could not be read just now, so only the latest message is shown.");
  sections.push("", ANSWER_SHAPE);
  return sections.join("\n");
}

/** Describe only existing offered commands; the service checks target and draft eligibility. */
function buildContinuationGuidance(context: AutomationStudioConversationDecisionContext): string {
  const offered = (id: string) => context.capabilities.some((capability) => capability.id === id);
  const lines = ["A Flow's name alone does not prove it already does the requested job. Use what the conversation actually established; ask which Flow when the intended one is ambiguous."];
  if (offered(AUTOMATION_STUDIO_CONVERSATION_EXPLORE.capability.id)) {
    lines.push("When they ask to continue or finish an unfinished creation, choose flow.explore for that Flow and omit instruction to use its saved goal. A compatible saved draft continues while the Flow and instructions are unchanged; the service checks this. A genuinely changed goal goes in instruction and may make old draft evidence incompatible. Repeating the same task is not by itself a request to change its saved goal.");
  }
  if (offered(AUTOMATION_STUDIO_CONVERSATION_IMPROVE.capability.id)) {
    lines.push("Changing a Flow with applied steps uses flow.improve, which works out a change and asks the person before applying it. An unfinished creation is not an applied Flow to improve.");
  }
  if (offered(AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE.capability.id)) {
    lines.push("An explicit request for a separate new automation uses flow.createHere; continuing an existing unfinished Flow does not create another one.");
  }
  return lines.join("\n");
}

function flowSection(context: AutomationStudioConversationDecisionContext): string {
  if (context.flows === null) return "The project's Flows could not be listed just now. If the person names one, pass the name on as they wrote it.";
  if (!context.flows.length) return "This project has no Flows yet.";
  // Every Flow (2026-09-30): it was the first 60 and a count of the rest.
  const lines = context.flows.map((flow) => `  - ${flow.name} (${flow.flowId})`);
  return ["The Flows in this project:", ...lines].join("\n");
}

function onScreenSection(context: AutomationStudioConversationDecisionContext): string {
  const open = context.onScreen;
  const flow = open.flowId ? context.flows?.find((entry) => entry.flowId === open.flowId) : undefined;
  const parts = [
    open.flowId ? `the Flow ${flow ? `"${flow.name}" ` : ""}(${open.flowId})` : "",
    open.subflowId ? `the part ${open.subflowId}` : "",
    open.runId ? `the run ${open.runId}` : "",
    open.recordingId ? `the recording ${open.recordingId}` : ""
  ].filter(Boolean);
  // Origin and path only: a query or fragment is where a page keeps a search,
  // a session or a token, and none of that says which page this is.
  const page = automationStudioConversationPageShown(open.pageUrl);
  const pageLine = page ? `\nIn their browser they are on the page ${page}. Something they ask to be made "here" or "for this page" starts there.${describedJobLine(context)}` : "";
  return (parts.length
    ? `The person has ${parts.join(", ")} open, so "it" or "this" most likely means that.`
    : "The person has nothing in particular open, so if they say \"it\" or \"this\" without naming a Flow, and the conversation has not named one, ask which Flow they mean rather than choosing one.") + pageLine;
}

/**
 * What a job described for the open site is: a request to build one from the
 * page. A person on a shopping site who types "Find every pair of wireless
 * earbuds under $50 ..." has asked for an automation and said what it should
 * do, in one message, without saying "automate" -- and the model, told only
 * that something asked to be made "here" starts here, was left to guess
 * between building it, replying, and exploring a Flow the project does not
 * have. Said only when the capability is offered, so the model is never told
 * to choose one it cannot.
 */
function describedJobLine(context: AutomationStudioConversationDecisionContext): string {
  const createHere = AUTOMATION_STUDIO_CONVERSATION_CREATE_HERE.capability.id;
  if (!context.capabilities.some((capability) => capability.id === createHere)) return "";
  return ` A job they describe for this site -- something to find, list, collect, fill in or buy on it -- that no Flow above already does is a request to make a new automation from this page: choose ${createHere} and pass their whole message, in their own words, as its instruction.`;
}
