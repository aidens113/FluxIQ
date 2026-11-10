// One decision to call a tool, carried out: the assistant's own tools
// (`find_tools`, the dock's navigation), or a program tool, which is checked
// for repeats, asked about when it is consequential and not clearly asked for,
// and otherwise run through the registry as the person. Each call is posted as
// its own step and its answer shown to the model.

import { randomUUID } from "node:crypto";
import type { AssistantConsequence, AssistantToolEntry } from "@fluxiq/contracts/program-api-inputs";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioActionConsequence } from "../../../action-permission-requests/index.ts";
import { panelAssistantClearlyAsked, panelAssistantConfirmWords, panelAssistantGatedClasses } from "../consent/index.ts";
import { panelAssistantInputWithContext } from "../context/index.ts";
import type { PanelAssistantActor, PanelAssistantCallResult, PanelAssistantConsent, PanelAssistantToolCall } from "../types.ts";
import type { PanelAssistantDecision } from "./decision.ts";
import { PANEL_ASSISTANT_CORE_TOOLS } from "./prompt.ts";
import { PANEL_ASSISTANT_WORDS, panelAssistantStepText, panelAssistantStepTitle } from "./step-words.ts";
import type { PanelAssistantTurnState } from "./types.ts";

/** The card's two answers in the words the design gives them: one press allows the act. */
const ALLOW_OR_NOT = [{ id: "grant", label: "Allow", route: null }, { id: "deny", label: "Don't", route: null }];

/** What the message's work does after a call: go on, wait for the person's Allow, or stop on a loop. */
export type PanelAssistantCallStep = "continue" | "asked" | "loop";

/** The attachment a navigation step carries for the dock to run. */
export const PANEL_ASSISTANT_CLIENT_ACTION_ATTACHMENT = "panel.client-action";

const ATTACHMENT_REF_MAX = 1_000;

const ASK_CONSEQUENCE: Partial<Record<AssistantConsequence, AutomationStudioActionConsequence>> = { send: "send_or_publish", money: "move_money", delete: "delete" };

/** Carries out one `call` decision. */
export async function panelAssistantCallStep<TActor extends PanelAssistantActor>(turn: PanelAssistantTurnState<TActor>, decision: Extract<PanelAssistantDecision, { kind: "call" }>): Promise<PanelAssistantCallStep> {
  if (decision.tool === PANEL_ASSISTANT_CORE_TOOLS.findTools) return findTools(turn, decision);
  if (decision.tool === PANEL_ASSISTANT_CORE_TOOLS.open || decision.tool === PANEL_ASSISTANT_CORE_TOOLS.select) return clientAction(turn, decision, decision.tool);
  const named = decision.tool === PANEL_ASSISTANT_CORE_TOOLS.callTool ? stringOf(decision.input.name) : decision.tool;
  const given = decision.tool === PANEL_ASSISTANT_CORE_TOOLS.callTool ? objectOf(decision.input.input) : decision.input;
  const tool = turn.programs.tools().find((candidate) => candidate.name === named);
  if (!tool) {
    turn.entries.push({ author: "tool", text: JSON.stringify({ tool: named, ok: false, error: PANEL_ASSISTANT_WORDS.unknownTool(named) }) });
    return panelAssistantWatched(turn, { toolId: named || "unknown", input: given, answer: "unknown tool", mutate: false, lasting: false, refused: true });
  }
  const call: PanelAssistantToolCall = { tool, input: panelAssistantInputWithContext(tool, given, turn.context) };
  const refusal = turn.watch.before(tool.name, call.input);
  if (refusal) {
    await turn.post(panelAssistantStepText({ title: refusal.chat.title, why: "", outcome: refusal.chat.text }));
    turn.entries.push({ author: "tool", text: JSON.stringify({ tool: tool.name, ok: false, refused: refusal.model }) });
    return turn.watch.due() ? "loop" : "continue";
  }
  const consequences = await turn.programs.consequencesOf(call, turn.actor);
  const projected = await turn.programs.projectedCostUsd(call, turn.actor);
  const gated = panelAssistantGatedClasses(consequences, projected !== undefined && projected > turn.purse.remaining);
  if (gated.length) {
    const target = await turn.programs.describeTarget(call, turn.actor);
    if (!panelAssistantClearlyAsked({ words: turn.words, classes: gated, target, context: turn.context })) {
      const consequencesAsked = gated.map((gatedClass) => ASK_CONSEQUENCE[gatedClass as AssistantConsequence]).filter((value): value is AutomationStudioActionConsequence => value !== undefined);
      await turn.threads.appendCard(turn.actor.userId, {
        conversationId: turn.conversationId,
        text: panelAssistantConfirmWords({ tool, target, classes: gated }),
        ask: { askId: `ask.${randomUUID()}`, kind: "confirm", parks: false, options: ALLOW_OR_NOT, ...(consequencesAsked.length ? { consequences: consequencesAsked } : {}) },
        call: { toolName: tool.name, input: call.input, words: turn.words, context: turn.context }
      });
      return "asked";
    }
  }
  // Reached unasked only when nothing is gated or the person's words clearly asked; a call that needs a press is always gated (its endpoint deletes), so its grant is earned by those words.
  const result = await panelAssistantRunProgramCall(turn, call, "words");
  // What the call committed counts against the message's allowance, so calls that each fit cannot add up past it.
  if (result.ok && projected !== undefined) turn.purse.paid(projected);
  await turn.post(panelAssistantStepText({ title: panelAssistantStepTitle(tool), why: decision.why, outcome: result.ok ? PANEL_ASSISTANT_WORDS.done : PANEL_ASSISTANT_WORDS.notDone(result.error ?? "the program gave no reason") }));
  turn.entries.push({ author: "tool", text: JSON.stringify(result.ok ? { tool: tool.name, ok: true, answer: result.payload ?? null } : { tool: tool.name, ok: false, error: result.error ?? null }) });
  return panelAssistantWatched(turn, { toolId: tool.name, input: call.input, answer: (result.ok ? result.payload ?? null : { error: result.error ?? null }) as JsonValue, mutate: !consequences.every((consequence) => consequence === "read"), lasting: gated.some((gatedClass) => gatedClass !== "budget"), refused: !result.ok });
}

/**
 * Runs one program call as the person, `via: "assistant"`. A call that needs a
 * press runs with a grant minted for exactly this call on the person's own
 * request, as `consent` says: their words clearly asked for it (`words`), or
 * they pressed Allow on its card (`press`). The audit records which.
 */
export async function panelAssistantRunProgramCall<TActor extends PanelAssistantActor>(turn: Pick<PanelAssistantTurnState<TActor>, "programs" | "actor" | "scope">, call: PanelAssistantToolCall, consent: PanelAssistantConsent): Promise<PanelAssistantCallResult> {
  if (!turn.programs.needsPress(call)) return turn.programs.call(call, turn.actor, { scope: turn.scope });
  const minted = await turn.programs.mintPress(call, turn.actor, turn.scope, consent);
  if (!minted.ok) return { ok: false, error: minted.error };
  return turn.programs.call(call, turn.actor, { scope: turn.scope, pressGrant: minted.grant });
}

async function findTools<TActor extends PanelAssistantActor>(turn: PanelAssistantTurnState<TActor>, decision: Extract<PanelAssistantDecision, { kind: "call" }>): Promise<PanelAssistantCallStep> {
  const query = stringOf(decision.input.query);
  const found: AssistantToolEntry[] = query ? turn.programs.find(query) : [];
  await turn.post(panelAssistantStepText({ title: PANEL_ASSISTANT_WORDS.findTitle, why: decision.why, outcome: PANEL_ASSISTANT_WORDS.found(found.length) }));
  const answer = found.map((tool) => ({ name: tool.name, summary: tool.summary, inputSchema: tool.inputSchema }));
  turn.entries.push({ author: "tool", text: JSON.stringify({ tool: PANEL_ASSISTANT_CORE_TOOLS.findTools, ok: true, answer }) });
  return panelAssistantWatched(turn, { toolId: PANEL_ASSISTANT_CORE_TOOLS.findTools, input: { query }, answer: found.map((tool) => tool.name), mutate: false, lasting: false, refused: false });
}

async function clientAction<TActor extends PanelAssistantActor>(turn: PanelAssistantTurnState<TActor>, decision: Extract<PanelAssistantDecision, { kind: "call" }>, tool: "panel.open" | "panel.select"): Promise<PanelAssistantCallStep> {
  const action = { tool, input: decision.input };
  turn.clientActions.push(action);
  const ref = JSON.stringify(action);
  const title = tool === PANEL_ASSISTANT_CORE_TOOLS.open ? PANEL_ASSISTANT_WORDS.openTitle : PANEL_ASSISTANT_WORDS.selectTitle;
  // The dock runs it from the send's answer; the attachment lets a dock that reads the thread later run it too.
  await turn.post(panelAssistantStepText({ title, why: decision.why, outcome: PANEL_ASSISTANT_WORDS.sentToPanel }), ref.length <= ATTACHMENT_REF_MAX ? { kind: PANEL_ASSISTANT_CLIENT_ACTION_ATTACHMENT, ref } : undefined);
  turn.entries.push({ author: "tool", text: JSON.stringify({ tool, ok: true, answer: "The panel was asked to do it." }) });
  return panelAssistantWatched(turn, { toolId: tool, input: decision.input, answer: decision.input, mutate: false, lasting: false, refused: false });
}

/** Tells the watch a call ran; a steer is posted and told to the model, and a due signal stops the message. */
export async function panelAssistantWatched<TActor extends PanelAssistantActor>(turn: PanelAssistantTurnState<TActor>, call: { toolId: string; input: JsonObject; answer: JsonValue; mutate: boolean; lasting: boolean; refused: boolean }): Promise<PanelAssistantCallStep> {
  const steer = turn.watch.after({ callId: `call.${randomUUID()}`, ...call });
  if (steer) {
    await turn.post(panelAssistantStepText({ title: steer.chat.title, why: "", outcome: steer.chat.text }));
    turn.entries.push({ author: "tool", text: steer.model });
  }
  return turn.watch.due() ? "loop" : "continue";
}

function stringOf(value: JsonValue | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function objectOf(value: JsonValue | undefined): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}
