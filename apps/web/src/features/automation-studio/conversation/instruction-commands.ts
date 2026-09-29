// What a person types, sent as an instruction.
//
// Before this, the composer sent free text to `append-turn`, Core stored it,
// and nothing read it back: a person who typed "run my kettle flow" wrote a row
// into a transcript. Now every message carries the panel's capability
// vocabulary -- generated from the registry, so the model is never told about
// a capability the panel does not have -- and what is on screen. Core stores
// the turn first, has the model decide, writes the decision into the thread,
// and answers with it. When the decision is to run something ordinary, the
// panel runs it here, through the same `runConversationCapability` a control's
// conversational path uses, and the result goes into the thread as well.
//
// A delete or a payment is never run from here. Core answers those with a
// confirmation in the thread instead, and the panel runs them only when the
// person confirms with their PIN (`useConversationThread.sendAnswer`).

import type { ProgramCommandTransport } from "../data/program-transport";
import {
  panelCapabilityVocabulary,
  type PanelCapabilityArgumentValue,
  type PanelCapabilityArguments,
  type PanelCapabilityDispatch
} from "./capabilities";
import { runConversationCapability } from "./turn-commands";

/** What the panel has open while the person writes, so "run it" means the Flow on screen. */
export type ConversationOnScreen = {
  flowId?: string;
  subflowId?: string;
  runId?: string;
  recordingId?: string;
};

export type ConversationInstructionPayload = {
  projectId: string;
  conversationId: string;
  text: string;
  onScreen?: ConversationOnScreen;
};

/** What Core decided the message was. */
export type ConversationInstructionDecision =
  | { kind: "invoke"; capabilityId: string; arguments: PanelCapabilityArguments; runNow: boolean }
  | { kind: "clarify" }
  | { kind: "reply" };

export type ConversationInstructionResult = {
  /** False only when the message itself was not stored. The person's words are then still in the composer. */
  ok: boolean;
  error?: string;
  /** The message was stored but Core's answer could not be written. Said in words, never swallowed. */
  problem: string | null;
  decision: ConversationInstructionDecision | null;
  /** What running the chosen capability came to, when one ran now. */
  dispatch: PanelCapabilityDispatch | null;
};

export async function sendConversationInstruction(
  api: ProgramCommandTransport,
  payload: ConversationInstructionPayload
): Promise<ConversationInstructionResult> {
  const onScreen = presentOnScreen(payload.onScreen);
  const result = await api.post<{ response?: unknown; problem?: unknown }>("append-turn", {
    projectId: payload.projectId,
    conversationId: payload.conversationId,
    text: payload.text,
    capabilities: panelCapabilityVocabulary(),
    ...(Object.keys(onScreen).length ? { onScreen } : {})
  });
  if (!result.ok) {
    return { ok: false, error: result.error ?? "The message could not be sent.", problem: null, decision: null, dispatch: null };
  }
  const problem = typeof result.payload?.problem === "string" && result.payload.problem ? result.payload.problem : null;
  const decision = instructionDecision(result.payload?.response);
  if (decision?.kind !== "invoke" || !decision.runNow) return { ok: true, problem, decision, dispatch: null };
  const dispatch = await runConversationCapability(api, {
    conversationId: payload.conversationId,
    request: { capabilityId: decision.capabilityId, arguments: decision.arguments },
    context: { projectId: payload.projectId, ...onScreen }
  });
  return { ok: true, problem, decision, dispatch };
}

/** Core's decision off the response, read forgivingly: anything unreadable is no decision, and nothing runs. */
function instructionDecision(value: unknown): ConversationInstructionDecision | null {
  if (!value || typeof value !== "object") return null;
  const response = value as { decision?: unknown; runNow?: unknown };
  const decision = response.decision && typeof response.decision === "object" ? (response.decision as Record<string, unknown>) : null;
  if (!decision) return null;
  if (decision.kind === "clarify") return { kind: "clarify" };
  if (decision.kind !== "invoke") return { kind: "reply" };
  const invocation = decision.invocation && typeof decision.invocation === "object" ? (decision.invocation as Record<string, unknown>) : null;
  if (!invocation || typeof invocation.capabilityId !== "string" || !invocation.capabilityId) return null;
  return {
    kind: "invoke",
    capabilityId: invocation.capabilityId,
    arguments: conversationCapabilityArguments(invocation.arguments),
    runNow: response.runNow === true
  };
}

/** Arguments as the dispatcher takes them. A value of a shape no capability takes is left out. */
export function conversationCapabilityArguments(value: unknown): PanelCapabilityArguments {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const args: Record<string, PanelCapabilityArgumentValue> = {};
  for (const [name, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === null || ["string", "number", "boolean"].includes(typeof entry)) args[name] = entry as PanelCapabilityArgumentValue;
    else if (typeof entry === "object") args[name] = entry as PanelCapabilityArgumentValue;
  }
  return args;
}

function presentOnScreen(onScreen: ConversationOnScreen | undefined): ConversationOnScreen {
  const present: ConversationOnScreen = {};
  for (const key of ["flowId", "subflowId", "runId", "recordingId"] as const) {
    const value = onScreen?.[key];
    if (value) present[key] = value;
  }
  return present;
}
