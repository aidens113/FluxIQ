// A call the model decided on that Core refused as a repeat before it ran.
//
// The repeat guard refuses a call the model already made on this same page
// (`../../llm/repeat-guard/`), before `executeTool`, so the call never has a row
// of its own: its decision's heading stood in the chat with no card, the
// model's reason reading as though the call were made (t193 1003, C13). Core's
// answer arrives on the seams the observer already wraps, as an edit's does
// (`./draft-edit.ts`): the next `decide` is shown the refusal under the
// decision's iteration (`core.repeat_check.<n>`), and a round the refusal
// stalls records it on the decision's trace row. Either says the card, once,
// right under the decision: the call's own action and control, "not done",
// and what the same call came to before. A call that runs says nothing here:
// its own rows are its card.

import type { AutomationStudioLlmEvidenceLoopInput } from "../../llm/index.ts";
import { emitAutomationStudioActivity } from "../emit.ts";
import { automationStudioActivityToolCall, type AutomationStudioActivityCallWords } from "../wording/index.ts";

type Evidence = Parameters<AutomationStudioLlmEvidenceLoopInput["decide"]>[0]["evidence"];
type Stalled = Parameters<NonNullable<AutomationStudioLlmEvidenceLoopInput["unusableDecisions"]>["stalled"]>[0];
type Call = { callId: string; toolId: string; value?: unknown };
type Held = { iteration: number; call: Call; described: AutomationStudioActivityCallWords | undefined };

/** The refusal entry's tool id and the loop's code (`../../llm/repeat-guard/feedback.ts`), read as plain strings so this module does not reach into the loop. */
const REPEAT_CHECK = "core.repeat_check";
const REPEAT_REFUSED = "llm_evidence_loop.repeat_refused";
/** An earlier outcome as the record may carry it: a code, never a sentence. */
const OUTCOME_SHAPED = /^[a-z0-9_]{1,64}$/u;

const record = (value: unknown): Record<string, unknown> | undefined => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined);

/** What the same call came to before, when the loop's entry for `iteration` refused it as a repeat. */
function refusedIn(evidence: Evidence, iteration: number): string | undefined {
  const entry = evidence.find((candidate) => candidate.callId === `${REPEAT_CHECK}.${iteration}`);
  if (!entry) return undefined;
  const outcome = record(record(entry.value)?.then)?.outcome;
  return typeof outcome === "string" ? outcome : "";
}

/** The same, from the stalled round's trace row for `iteration`. */
function refusedInTrace(trace: Stalled["trace"], iteration: number): string | undefined {
  const row = [...trace].reverse().find((candidate) => candidate.iteration === iteration);
  return row?.resultCode === REPEAT_REFUSED ? row.resultReason ?? "" : undefined;
}

/** The card of a call refused as a repeat: its own action and control, failed, with the loop's code and the earlier outcome on its record. */
function card(held: Held, outcome: string): void {
  const words = automationStudioActivityToolCall(held.call, held.described);
  const text = [`Result: ${REPEAT_REFUSED}`, OUTCOME_SHAPED.test(outcome) ? `Reason: ${outcome}` : "", words.node ? `Node: ${words.node}` : ""].filter(Boolean).join(" · ");
  emitAutomationStudioActivity({ phase: words.phase, label: `${words.label} — not done`, detail: { kind: words.kind, title: words.title, status: "failed", ref: held.call.toolId, text } });
}

/**
 * One decided call waiting to run: `hold` it as `decide` returns it, then
 * `ran` (it ran: nothing more to say), `decided` (the next decision's
 * evidence) or `stalled` (the stalled round's trace) settles it, once.
 */
export function automationStudioActivityRefusedCall(): {
  hold(call: Held): void;
  decided(evidence: Evidence): void;
  ran(): void;
  stalled(input: Stalled): void;
} {
  let held: Held | undefined;
  const settle = (outcome: string | undefined): void => {
    const call = held;
    held = undefined;
    if (call && outcome !== undefined) card(call, outcome);
  };
  return {
    hold: (call) => { held = call; },
    decided: (evidence) => { if (held) settle(refusedIn(evidence, held.iteration)); },
    ran: () => { held = undefined; },
    stalled: (input) => { if (held) settle(refusedInTrace(input.trace, held.iteration)); }
  };
}
