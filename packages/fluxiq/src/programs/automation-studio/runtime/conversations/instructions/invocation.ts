// Turning "do this, with these" into an invocation the panel can run.
//
// Everything a model or a person left out that Core can work out is worked out
// here, so the model is asked for the fewest things that could work:
//
// - The capability. An exact id is taken as written; anything else resolves to
//   the closest capability by id, title and phrases, never to a refusal.
// - Argument names. `flow` where the panel says `flowId` is the same argument,
//   and is taken as it. A name nothing matches is left out and recorded.
// - The project, and whatever the panel has open, fill the matching arguments.
// - A required instruction nothing supplied is the person's own message, when
//   that message says what to do and not only which capability to start.
// - A Flow named by its name becomes its id. When the capability needs a Flow
//   and none can be settled on -- none named and several exist, or a name that
//   matches nothing -- the answer is one question back, naming the choices.
//
// A PIN or any other credential is never taken from a model: the person gives
// it themselves, when they confirm.

import { AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES } from "../../action-permissions/client/index.ts";
import type { AutomationStudioPanelCapability } from "../../panel-capabilities/index.ts";
import { automationStudioClosestName } from "./closest.ts";
import type {
  AutomationStudioConversationDecision,
  AutomationStudioConversationFlowReference,
  AutomationStudioConversationOnScreen
} from "./decision.ts";
import { automationStudioConversationFlowNamed } from "./flows.ts";
import { automationStudioConversationSaysWhatToDo } from "./says-what-to-do.ts";

/** What Core knows while deciding: the panel's vocabulary, the project's Flows, and what is on screen. */
export type AutomationStudioConversationDecisionContext = {
  projectId: string;
  capabilities: readonly AutomationStudioPanelCapability[];
  /** Null when the Flows could not be listed; a written Flow name is then passed on as written. */
  flows: readonly AutomationStudioConversationFlowReference[] | null;
  onScreen: AutomationStudioConversationOnScreen;
  /**
   * What the person wrote. A capability whose required `instruction` is the
   * person's own words takes it from here when nothing else supplied it
   * (`fillInstructionFromMessage`). Absent, that argument is asked for.
   */
  message?: string;
};

/** Below this an argument name is not taken as meaning any particular argument. */
const ARGUMENT_MATCH_FLOOR = 0.25;
const SECRET_NAME = /pin|password|secret|token|authori[sz]ation|credential/iu;
const ON_SCREEN_ARGUMENTS = ["subflowId", "runId", "recordingId"] as const;
const LISTED_FLOWS = 8;
/** The argument that holds what an automation should do, in the person's own words. */
const INSTRUCTION_ARGUMENT = "instruction";

type MappedArguments = {
  values: Record<string, unknown>;
  renamed: Record<string, string>;
  dropped: string[];
};

export function automationStudioConversationInvocationDecision(
  written: string,
  supplied: unknown,
  context: AutomationStudioConversationDecisionContext,
  say: string | null
): AutomationStudioConversationDecision {
  const exact = context.capabilities.find((capability) => capability.id === written);
  const match = exact
    ? { key: exact.id, confidence: 1 }
    : automationStudioClosestName(written, context.capabilities.map((capability) => ({ key: capability.id, labels: [capability.title, ...capability.phrases, capability.summary] })));
  const capability = context.capabilities.find((entry) => entry.id === match?.key);
  if (!capability || !match) {
    return { kind: "reply", text: "The control panel did not tell me what it can do this time, so I cannot act on that from here. Reopening the conversation usually fixes it; the controls themselves still work." };
  }

  const { values, renamed, dropped } = mappedArguments(capability, suppliedRecord(supplied));
  rescueFlowFromProject(capability, values, renamed, context);
  const flowQuestion = settleFlow(capability, values, context);
  if (flowQuestion) return flowQuestion;
  fillFromContext(capability, values, context);
  fillInstructionFromMessage(capability, values, context);
  const missingQuestion = askForMissing(capability, values);
  if (missingQuestion) return missingQuestion;

  const gated = capability.consequences.filter((consequence) => (AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES as readonly string[]).includes(consequence));
  const asksFirst = capability.reauthorizes || gated.length > 0;
  return {
    kind: "invoke",
    say,
    invocation: {
      capabilityId: capability.id,
      title: capability.title,
      arguments: values,
      confidence: match.confidence,
      requestedId: exact ? null : written,
      renamedArguments: renamed,
      droppedArguments: dropped,
      asksFirst,
      // A capability the panel marked as re-authorizing with no gated class
      // named still asks: the whole gated set stands in, so the confirmation
      // takes the PIN rather than being answered in passing.
      consequences: asksFirst ? (gated.length ? gated : [...AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES]) : []
    }
  };
}

/**
 * The supplied arguments as a record. Text that looks like JSON is read as
 * JSON; text that turns out not to be is recorded under `__unreadable` so the
 * reason travels into `droppedArguments` instead of vanishing, and the
 * invocation goes ahead on what Core can fill itself.
 */
function suppliedRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string" && value.trim().startsWith("{")) {
    try {
      return suppliedRecord(JSON.parse(value) as unknown);
    } catch (error) {
      return { __unreadable: error instanceof Error ? error.message : String(error) };
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

function mappedArguments(capability: AutomationStudioPanelCapability, supplied: Record<string, unknown>): MappedArguments {
  const values: Record<string, unknown> = {};
  const renamed: Record<string, string> = {};
  const dropped: string[] = [];
  const pending: Array<[string, unknown]> = [];
  for (const [name, value] of Object.entries(supplied)) {
    if (value === undefined || value === null || value === "") continue;
    if (SECRET_NAME.test(name) || name === "__unreadable") {
      dropped.push(name);
      continue;
    }
    const declared = capability.arguments.find((argument) => argument.name === name || argument.name.toLowerCase() === name.toLowerCase());
    if (declared) values[declared.name] = value;
    else pending.push([name, value]);
  }
  for (const [name, value] of pending) {
    // Never onto the project: Core sets it from the thread a moment later, so a
    // value renamed there is simply lost. Live DeepSeek's `flowId` for a
    // capability with no Flow argument landed there, and the Flow the person
    // named vanished without a word.
    const open = capability.arguments.filter((argument) => !(argument.name in values) && argument.name !== "projectId" && !SECRET_NAME.test(argument.name));
    const match = automationStudioClosestName(name, open.map((argument) => ({ key: argument.name, labels: [argument.describe] })));
    if (match && match.confidence >= ARGUMENT_MATCH_FLOOR) {
      values[match.key] = value;
      renamed[name] = match.key;
    } else {
      dropped.push(name);
    }
  }
  return { values, renamed, dropped };
}

/**
 * A Flow written where the project goes. Live DeepSeek did this twice in ten
 * calls -- `"projectId": "flow.news-5d0"` with no `flowId` -- and since the
 * project is always the thread's own, overwriting it would quietly lose which
 * Flow the person meant: "what ran lately on the news one" became every run in
 * the project. When the value names one of the project's Flows and the
 * capability takes a Flow that was not given, it is taken as the Flow.
 */
function rescueFlowFromProject(
  capability: AutomationStudioPanelCapability,
  values: Record<string, unknown>,
  renamed: Record<string, string>,
  context: AutomationStudioConversationDecisionContext
): void {
  const written = values.projectId;
  if (typeof written !== "string" || written === context.projectId || !context.flows) return;
  if (!capability.arguments.some((argument) => argument.name === "flowId")) return;
  if (values.flowId !== undefined && values.flowId !== "") return;
  const flow = automationStudioConversationFlowNamed(written, context.flows);
  if (!flow) return;
  values.flowId = flow.flowId;
  renamed.projectId = "flowId";
}

/** Settles the Flow a capability is about, or answers with the one question that would. */
function settleFlow(
  capability: AutomationStudioPanelCapability,
  values: Record<string, unknown>,
  context: AutomationStudioConversationDecisionContext
): AutomationStudioConversationDecision | null {
  const argument = capability.arguments.find((entry) => entry.name === "flowId");
  if (!argument) return null;
  const given = values.flowId;
  const flows = context.flows;
  if (typeof given === "string" || typeof given === "number") {
    if (!flows) return null;
    const named = automationStudioConversationFlowNamed(String(given), flows);
    if (named) {
      values.flowId = named.flowId;
      return null;
    }
    if (!flows.length) return noFlows(capability);
    return { kind: "clarify", question: `I could not find a Flow called "${String(given)}". Which one did you mean: ${flowChoices(flows)}?` };
  }
  if (context.onScreen.flowId) {
    values.flowId = context.onScreen.flowId;
    return null;
  }
  if (!flows || !argument.required) return null;
  if (flows.length === 1) {
    values.flowId = flows[0]!.flowId;
    return null;
  }
  if (!flows.length) return noFlows(capability);
  return { kind: "clarify", question: `Which Flow should I use for "${capability.title}": ${flowChoices(flows)}?` };
}

/**
 * One question for what the capability cannot go without and nothing supplied.
 * Running it anyway only fails in the panel with a field name the person never
 * saw; asking says, in the capability's own words, what is still needed. The
 * PIN is never asked for here: the confirmation takes it.
 */
function askForMissing(capability: AutomationStudioPanelCapability, values: Record<string, unknown>): AutomationStudioConversationDecision | null {
  const missing = capability.arguments.filter((argument) => argument.required && !SECRET_NAME.test(argument.name)
    && (values[argument.name] === undefined || values[argument.name] === null || values[argument.name] === ""));
  if (!missing.length) return null;
  const needs = missing.map((argument) => argument.describe.replace(/\.$/u, "").replace(/^\w/u, (letter) => letter.toLowerCase()));
  return { kind: "clarify", question: `To "${capability.title}" I still need ${needs.length === 1 ? needs[0] : `${needs.slice(0, -1).join(", ")} and ${needs[needs.length - 1]}`}. What should I use?` };
}

function noFlows(capability: AutomationStudioPanelCapability): AutomationStudioConversationDecision {
  return { kind: "reply", text: `This project has no Flows yet, so there is nothing to use for "${capability.title}". Ask me to create one and I will.` };
}

function fillFromContext(capability: AutomationStudioPanelCapability, values: Record<string, unknown>, context: AutomationStudioConversationDecisionContext): void {
  const takes = (name: string) => capability.arguments.some((argument) => argument.name === name) && (values[name] === undefined || values[name] === "");
  // The project is the thread's, always. A conversation belongs to one project
  // and the endpoint already checked the caller may act in it; a model that
  // writes a different one -- live DeepSeek once put a Flow's id there -- would
  // send the request somewhere the person never pointed at.
  if (capability.arguments.some((argument) => argument.name === "projectId")) values.projectId = context.projectId;
  for (const name of ON_SCREEN_ARGUMENTS) {
    const open = context.onScreen[name];
    if (open && takes(name)) values[name] = open;
  }
}

/**
 * A required instruction nothing supplied, taken from the message itself.
 *
 * "Find every pair of wireless earbuds under $50 ..." typed in the chat window
 * is both the request and what the automation should do. Answering it "I still
 * need what the automation should do" -- which the words-only reading always
 * did, because it fills no argument, and a model did whenever it named the
 * capability alone -- made the person type the same words twice, and a Lab run
 * that types its task into the chat never reached a build at all. A message
 * that is no more than the capability's own name or phrases ("automate this
 * page") says nothing about what to do, and is still asked about.
 */
function fillInstructionFromMessage(
  capability: AutomationStudioPanelCapability,
  values: Record<string, unknown>,
  context: AutomationStudioConversationDecisionContext
): void {
  if (!capability.arguments.some((argument) => argument.name === INSTRUCTION_ARGUMENT && argument.required)) return;
  const given = values[INSTRUCTION_ARGUMENT];
  if (typeof given === "string" ? given.trim() !== "" : given !== undefined && given !== null) return;
  const message = context.message?.trim();
  if (!message) return;
  if (!automationStudioConversationSaysWhatToDo(capability, message)) return;
  values[INSTRUCTION_ARGUMENT] = message;
}

function flowChoices(flows: readonly AutomationStudioConversationFlowReference[]): string {
  const names = flows.slice(0, LISTED_FLOWS).map((flow) => `"${flow.name}"`);
  if (flows.length > LISTED_FLOWS) return `${names.join(", ")}, or one of ${flows.length - LISTED_FLOWS} more`;
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}
