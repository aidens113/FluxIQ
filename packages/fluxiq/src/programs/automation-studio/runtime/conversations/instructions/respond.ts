// Writing what a person's message became back into the thread.
//
// Every message gets a turn in answer, whatever happened, because a person who
// asked for something and saw nothing cannot tell a refusal from a dropped
// message. The turn says what was understood:
//
// - a reply or a question, in the model's words;
// - "Doing <capability>", naming the Flow, saying which capability a misspelt
//   or paraphrased request was taken as, and saying when Core had to match the
//   words itself because the model could not be used;
// - for the capabilities that delete something or move money, and only those,
//   a confirmation the person answers in the thread with their PIN. The
//   invocation it would run travels on the turn as a `panel-capability`
//   attachment, so the panel that sees the confirmation granted knows exactly
//   what to run without a second store. The reference is base64url JSON: a
//   turn's attachment reference is an identifier-shaped string to the panel's
//   contract parser, and a turn whose reference is not is dropped whole, which
//   would take the confirmation with it.
//
// Everything else runs straight away: the person asking is the permission.

import { randomUUID } from "node:crypto";
import { AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES, isAutomationStudioActionConsequence, type AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type { AutomationStudioConversationTurn } from "../turn.ts";
import type { AutomationStudioConversationAutomationTurnRequest } from "../writer.ts";
import type {
  AutomationStudioConversationFlowReference,
  AutomationStudioConversationInterpretation,
  AutomationStudioConversationInvocation
} from "./decision.ts";

/** The attachment kind that carries an invocation waiting on the person's confirmation. */
export const AUTOMATION_STUDIO_PANEL_CAPABILITY_ATTACHMENT = "panel-capability";

/** The store's bound on an attachment reference. */
const ATTACHMENT_REF_MAX = 1_000;

export type AutomationStudioConversationResponseWrite = {
  host: { appendAutomationTurn(input: AutomationStudioConversationAutomationTurnRequest): Promise<AutomationStudioConversationTurn> };
  projectId: string;
  conversationId: string;
  interpretation: AutomationStudioConversationInterpretation;
  flows: readonly AutomationStudioConversationFlowReference[] | null;
};

export type AutomationStudioConversationResponseWritten = {
  turnId: string;
  askId: string | null;
  runNow: boolean;
};

export async function respondToAutomationStudioConversationTurn(input: AutomationStudioConversationResponseWrite): Promise<AutomationStudioConversationResponseWritten> {
  const { decision } = input.interpretation;
  const base = { projectId: input.projectId, conversationId: input.conversationId, attachment: null };
  if (decision.kind !== "invoke") {
    const words = decision.kind === "reply" ? decision.text : decision.question;
    const turn = await input.host.appendAutomationTurn({ ...base, text: withProblem(words, input.interpretation), ask: null });
    return { turnId: turn.turnId, askId: null, runNow: false };
  }

  const invocation = decision.invocation;
  const target = flowPhrase(invocation, input.flows);
  const lead = decision.say ? `${decision.say} ` : "";
  if (!invocation.asksFirst) {
    const text = `${lead}Doing "${invocation.title}"${target}.${readingNotes(invocation)}`;
    const turn = await input.host.appendAutomationTurn({ ...base, text: withProblem(text, input.interpretation), ask: null });
    return { turnId: turn.turnId, askId: null, runNow: true };
  }

  const ref = automationStudioPanelInvocationRef(invocation);
  if (!ref) {
    // Too much to carry on one confirmation. Running it without the arguments
    // would fall back to whatever is on screen, which for a delete could be
    // the wrong thing, so it is not offered; the person is told why.
    const turn = await input.host.appendAutomationTurn({ ...base, text: withProblem(`${lead}"${invocation.title}" was asked for with more detail than one confirmation can carry, so I have not set it up. Ask for it again with fewer things at once.`, input.interpretation), ask: null });
    return { turnId: turn.turnId, askId: null, runNow: false };
  }
  const consequences = invocation.consequences.filter(isAutomationStudioActionConsequence);
  const askId = `panel-command.${randomUUID()}`;
  const text = `${lead}You asked me to "${invocation.title}"${target}. That would ${joined(consequences)}, and it cannot be undone, so confirm it here with your PIN, or cancel.${readingNotes(invocation)}`;
  const turn = await input.host.appendAutomationTurn({
    ...base,
    text: withProblem(text, input.interpretation),
    attachment: { kind: AUTOMATION_STUDIO_PANEL_CAPABILITY_ATTACHMENT, ref },
    ask: {
      askId,
      kind: "confirm",
      // Nothing waits on it: the panel runs the capability when the person
      // confirms, and a confirmation nobody gives simply leaves it undone.
      parks: false,
      timeoutMs: null,
      onTimeout: null,
      options: null,
      routes: null,
      consequences,
      missing: null,
      // The control kind is a short lower-case word to the panel's parser, so
      // the capability id travels in the attachment rather than here.
      control: { name: invocation.title, kind: "panel action" },
      permissionRequest: null
    }
  });
  return { turnId: turn.turnId, askId, runNow: false };
}

/**
 * The invocation a confirmation carries, as its attachment reference: base64url
 * JSON of the capability id and its arguments. `projectId` is left out, because
 * the thread belongs to the project and the panel fills it back in. Null when
 * even that does not fit the store's bound.
 */
export function automationStudioPanelInvocationRef(invocation: Pick<AutomationStudioConversationInvocation, "capabilityId" | "arguments">): string | null {
  const { projectId: _derived, ...args } = invocation.arguments;
  const ref = Buffer.from(JSON.stringify({ capabilityId: invocation.capabilityId, arguments: args }), "utf8").toString("base64url");
  return ref.length <= ATTACHMENT_REF_MAX ? ref : null;
}

function flowPhrase(invocation: AutomationStudioConversationInvocation, flows: readonly AutomationStudioConversationFlowReference[] | null): string {
  const flowId = invocation.arguments.flowId;
  if (typeof flowId !== "string") return "";
  const flow = flows?.find((entry) => entry.flowId === flowId);
  return flow ? ` for the Flow "${flow.name}"` : ` for ${flowId}`;
}

/** What the thread owes the person about how their words were read, so a wrong reading can be corrected in the next message. */
function readingNotes(invocation: AutomationStudioConversationInvocation): string {
  const notes: string[] = [];
  if (invocation.requestedId && invocation.confidence < 1) notes.push(`That was asked for as "${invocation.requestedId}", and I took it as "${invocation.title}".`);
  const renamed = Object.entries(invocation.renamedArguments).map(([written, taken]) => `${written} as ${taken}`);
  if (renamed.length) notes.push(`I read ${renamed.join(", ")}.`);
  const dropped = invocation.droppedArguments.filter((name) => !/pin|password|secret|token|authori[sz]ation|credential|__unreadable/iu.test(name));
  if (dropped.length) notes.push(`I left out ${dropped.join(", ")}, which "${invocation.title}" does not take.`);
  return notes.length ? ` ${notes.join(" ")}` : "";
}

function withProblem(text: string, interpretation: AutomationStudioConversationInterpretation): string {
  if (interpretation.source === "model" || !interpretation.modelProblem) return text;
  return `${text}\n\n(I read your message without the model, because ${interpretation.modelProblem}. If I got it wrong, say it again another way.)`;
}

function joined(consequences: readonly AutomationStudioActionConsequence[]): string {
  const phrases = consequences.map((consequence) => AUTOMATION_STUDIO_ACTION_CONSEQUENCE_PHRASES[consequence]);
  if (phrases.length <= 1) return phrases[0] ?? "change something for good";
  return `${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}`;
}
