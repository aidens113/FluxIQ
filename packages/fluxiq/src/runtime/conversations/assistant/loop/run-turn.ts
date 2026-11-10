// One message's work: the assistant's tool loop, on Core's one iteration driver
// (`runtime/agents/iteration`).
//
// Each iteration asks the model for one decision -- answer the person, or call
// one tool -- and carries it out (`./call-step.ts`). The loop goes on until the
// model answers, a consequential call waits on the person's Allow, the
// person's per-message spending allowance is used up, or loop detection stops
// a repeat that steering and refusing did not (`./loop-watch.ts`). Nothing
// counts rounds or calls: those two bounds are the only ones (root-cause rule,
// user 2026-11-10).

import type { JsonValue } from "../../../../core/index.ts";
import { runAgentIterations } from "../../../agents/iteration/index.ts";
import type { AutomationStudioConversationTurn } from "../../turn.ts";
import { panelAssistantContextLine } from "../context/index.ts";
import type { PanelAssistantActor, PanelAssistantModel, PanelAssistantModelReply, PanelAssistantModelTurn } from "../types.ts";
import { panelAssistantCallStep, panelAssistantWatched } from "./call-step.ts";
import { panelAssistantDecisionOf } from "./decision.ts";
import { panelAssistantPageTools } from "./page-tools.ts";
import { panelAssistantInstructions } from "./prompt.ts";
import { PANEL_ASSISTANT_WORDS } from "./step-words.ts";
import type { PanelAssistantTurnOutcome, PanelAssistantTurnState } from "./types.ts";

/**
 * How much of the thread the model reads, newest last. A context choice, not a
 * bound on the work: what this message does is all shown, however long.
 */
const THREAD_TURNS = 100;

/** Runs one message's work to its end; never throws for a model or tool failure, which it says in the thread. */
export async function runPanelAssistantTurn<TActor extends PanelAssistantActor>(turn: PanelAssistantTurnState<TActor>, input: { model: PanelAssistantModel; signal: AbortSignal }): Promise<PanelAssistantTurnOutcome> {
  const names = await turn.programs.selectionNames(turn.context, turn.actor);
  const contextLine = panelAssistantContextLine(turn.context, names);
  const pageTools = panelAssistantPageTools(turn.programs.tools(), turn.context, (query) => turn.programs.find(query));
  const thread = (await turn.threads.recent(turn.actor.userId, turn.conversationId, THREAD_TURNS)).map(modelTurn);
  const end = (ending: PanelAssistantTurnOutcome["ending"]): { kind: "complete"; result: PanelAssistantTurnOutcome } => ({ kind: "complete", result: { ending, spentUsd: turn.purse.spent, clientActions: turn.clientActions } });
  return runAgentIterations<PanelAssistantTurnOutcome>({
    maxIterations: Number.POSITIVE_INFINITY,
    iterate: async () => {
      if (input.signal.aborted) return end("stopped");
      if (turn.purse.exhausted) {
        await turn.post(PANEL_ASSISTANT_WORDS.allowance(turn.purse.allowanceUsd, turn.purse.spent));
        return end("allowance");
      }
      const instructions = panelAssistantInstructions({ contextLine, pageTools, allowanceLeftUsd: turn.purse.remaining });
      let reply: PanelAssistantModelReply;
      try {
        reply = await input.model.decide({ instructions, transcript: [...thread, ...turn.entries] }, { signal: input.signal, caller: { userId: turn.actor.userId, sessionId: turn.actor.sessionId } });
      } catch (error) {
        turn.purse.paid(paidOf(error));
        if (input.signal.aborted) return end("stopped");
        const message = error instanceof Error ? error.message : String(error);
        // A failure another try may fix is tried again, watched like any call: the same failure again and again is a loop.
        if (retryable(error) && (await panelAssistantWatched(turn, { toolId: "model", input: { failure: codeOf(error) }, answer: codeOf(error), mutate: false, lasting: false, refused: true })) === "continue") return { kind: "continue" };
        await turn.post(PANEL_ASSISTANT_WORDS.modelFailed(message));
        return end("model_failed");
      }
      turn.purse.paid(reply.costUsd);
      const read = panelAssistantDecisionOf(reply.decision);
      if (!read.ok) {
        turn.entries.push({ author: "tool", text: JSON.stringify({ ok: false, error: `${read.problem} Answer with one JSON object, as your instructions describe.` }) });
        const next = await panelAssistantWatched(turn, { toolId: "decision", input: { problem: read.problem }, answer: read.problem, mutate: false, lasting: false, refused: true });
        if (next === "loop") return loopEnd(turn, end);
        return { kind: "continue" };
      }
      const decision = read.decision;
      turn.entries.push({ author: "assistant", text: JSON.stringify(decision.kind === "reply" ? { reply: decision.text } : { tool: decision.tool, input: decision.input, why: decision.why }) });
      if (decision.kind === "reply") {
        await turn.post(decision.text);
        return end("replied");
      }
      const step = await panelAssistantCallStep(turn, decision);
      if (step === "asked") return end("asked");
      if (step === "loop") return loopEnd(turn, end);
      return { kind: "continue" };
    },
    exhausted: () => ({ ending: "stopped", spentUsd: turn.purse.spent, clientActions: turn.clientActions })
  });
}

async function loopEnd<TActor extends PanelAssistantActor>(turn: PanelAssistantTurnState<TActor>, end: (ending: "loop") => { kind: "complete"; result: PanelAssistantTurnOutcome }): Promise<{ kind: "complete"; result: PanelAssistantTurnOutcome }> {
  await turn.post(PANEL_ASSISTANT_WORDS.loopStopped);
  return end("loop");
}

function modelTurn(turn: AutomationStudioConversationTurn): PanelAssistantModelTurn {
  return { author: turn.author === "person" ? "person" : "assistant", text: turn.ask ? `${turn.text} [asked the person; ${turn.ask.status === "pending" ? "no answer yet" : turn.ask.answer?.kind === "grant" ? "they allowed it" : "they did not allow it"}]` : turn.text };
}

function retryable(error: unknown): boolean {
  return error !== null && typeof error === "object" && (error as { retryable?: unknown }).retryable === true;
}

function codeOf(error: unknown): JsonValue {
  const code = error !== null && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" ? code : error instanceof Error ? error.name : "failure";
}

/** What a failed call still cost, where the model said (`PanelAssistantModel`: a thrown error may carry `costUsd`). */
function paidOf(error: unknown): number {
  const cost = error !== null && typeof error === "object" ? (error as { costUsd?: unknown }).costUsd : undefined;
  return typeof cost === "number" ? cost : 0;
}
