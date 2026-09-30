// What the model is told when a person writes.
//
// The panel's vocabulary, rendered once in Core by `panel-capabilities`, so the
// model reads the same list whichever path asked it. Then what only this moment
// knows: the project's Flows by name, and what the person has open. Then the
// answer, in three small shapes, with nothing required that Core can fill in
// itself -- a Flow may be named by its name, arguments the model does not know
// are left out, and the id need not be spelt perfectly.

import { automationStudioPanelCapabilityVocabulary } from "../../panel-capabilities/index.ts";
import { automationStudioConversationPageShown } from "../commands/index.ts";
import type { AutomationStudioConversationDecisionContext } from "./invocation.ts";

const LISTED_FLOWS = 60;

const ANSWER_SHAPE = [
  "Answer with one JSON object and nothing else, in one of these three shapes:",
  '  {"do": "<capability id>", "with": {"<argument>": "<value>"}}   to do something in the panel. Leave out any argument you do not know.',
  '  {"ask": "<one short question>"}   only when you cannot tell what they want, such as which of several Flows they mean.',
  '  {"reply": "<your answer>"}   when they are not asking for anything to be done, or asked what you can do.',
  "Choose the capability that does all of what was asked: when they ask for something to be run, choose the one that runs it, not one that only gets it ready.",
  "Leave projectId out: it is always this project. A Flow goes in flowId, and can be given by its name; FluxIQ finds its id. Never ask for or supply a PIN: FluxIQ asks the person for it when it is needed.",
  "Do not ask whether you may do something ordinary. Asking for it is the person's permission."
].join("\n");

export function automationStudioConversationInstructions(
  context: AutomationStudioConversationDecisionContext,
  notes: { transcriptWithheld: boolean }
): string {
  const sections = [automationStudioPanelCapabilityVocabulary(context.capabilities), "", flowSection(context), "", onScreenSection(context)];
  if (notes.transcriptWithheld) sections.push("", "The earlier part of this conversation could not be read just now, so only the latest message is shown.");
  sections.push("", ANSWER_SHAPE);
  return sections.join("\n");
}

function flowSection(context: AutomationStudioConversationDecisionContext): string {
  if (context.flows === null) return "The project's Flows could not be listed just now. If the person names one, pass the name on as they wrote it.";
  if (!context.flows.length) return "This project has no Flows yet.";
  const lines = context.flows.slice(0, LISTED_FLOWS).map((flow) => `  - ${flow.name} (${flow.flowId})`);
  if (context.flows.length > LISTED_FLOWS) lines.push(`  ...and ${context.flows.length - LISTED_FLOWS} more.`);
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
  const pageLine = page ? `\nIn their browser they are on the page ${page}. Something they ask to be made "here" or "for this page" starts there.` : "";
  return (parts.length
    ? `The person has ${parts.join(", ")} open, so "it" or "this" most likely means that.`
    : "The person has nothing in particular open, so if they say \"it\" or \"this\" without naming a Flow, and the conversation has not named one, ask which Flow they mean rather than choosing one.") + pageLine;
}
