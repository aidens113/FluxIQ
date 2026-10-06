// An edit to the draft is said once the loop has answered it.
//
// The model's `amend_draft` decision is carried out inside the loop, after
// `decide` returns and without a tool call, so the observer cannot see it land.
// Said as it returned, every edit read as work done: live run
// `run-murdouox-c5294247` (t195, `S/0033`-`S/0036`) showed three "Updating the
// draft Flow -- Adding the repeat ..." and one "Rerunning the request listing
// ..." that Core had refused (`already_so`, `changes_nothing`), and the round
// then stopped for edits that changed nothing.
//
// So the edit waits for the loop's answer, which arrives on one of the seams
// the observer already wraps, and nothing the loop does is touched:
//
// - the next `decide`: the evidence it is shown carries the loop's refusal of
//   that decision under its iteration (`core.amendment_check.<n>`, or
//   `core.repeat_check.<n>` for a step asked to run again that the repeat
//   guard refused), and no entry means the edit landed;
// - the next tool call: a step asked to run again (`rerun.<step>`) is run, so
//   the edit landed;
// - the round stalling (`unusableDecisions.stalled`): its trace's row for the
//   decision says what was refused.
//
// Once answered, the edit is said as two things: the decision, with the
// model's own sentence as what it tried, and under it a card with Core's
// answer -- done, partly done, or not done and why (`../wording/draft-edit-card.ts`).
// The model's sentence is never the result, and never the thing "not done": a
// refused edit read "... so this was not done: <the model's summary>", and an
// edit done only in part read as all it set out to do (t193 1003, C13/C14).
//
// A round that ends any other way right after an edit (its budget spent) never
// says that edit: no seam reports it, and a card that might claim work Core
// refused is worse than none.
//
// **An edit the loop could not use is no edit.** A reply shaped like an edit
// that the loop refused as a decision (`decision_shape_invalid`, or another
// reason it names; `../../llm/evidence-loop/decision-refusal.ts`) did nothing,
// and is said as a decision that didn't work, with neither the model's reason
// nor a card: live run `run-musp39u8-9ac026ab` (U8, moment 33; steps
// 0265-0267, 0179-0183) showed such replies as "Updating the draft Flow --
// Rerunning the search step ...". The loop's answer is its
// `core.decision_check.<n>` entry, or the stalled round's `unusable` row.
//
// **What the card says was changed** comes from the amendments Core applied,
// read against the draft the model was shown (`./edit-words.ts`): "Edit the
// Flow · Done" said nothing of an edit that dropped the Add to cart step (U2,
// `run-muw60unq-591e23bd`). An edit that only asked for a step to run again
// has no card when it lands: the step's own rows say how that went, and "Edit
// the Flow · Done" stood before a rerun FluxIQ then did not send (U-8,
// `run-muw60j7c-bb7c9a62`, moments 11-15).

import type { AutomationStudioLlmEvidenceLoopInput } from "../../llm/index.ts";
import { emitAutomationStudioActivity } from "../emit.ts";
import { emitAutomationStudioActivityThought } from "../thought.ts";
import { automationStudioActivityDraftEditCard } from "../wording/index.ts";
import { automationStudioActivityDraftEditWords } from "./edit-words.ts";

type Evidence = Parameters<AutomationStudioLlmEvidenceLoopInput["decide"]>[0]["evidence"];
type Stalled = Parameters<NonNullable<AutomationStudioLlmEvidenceLoopInput["unusableDecisions"]>["stalled"]>[0];
type Answer = Parameters<typeof automationStudioActivityDraftEditCard>[0];

/** The refusal entries' tool ids (`../../llm/draft-amendment-feedback.ts`, `../../llm/repeat-guard/feedback.ts`), read as plain strings so this module does not reach into the loop. */
const AMENDMENT_CHECK = "core.amendment_check";
const REPEAT_CHECK = "core.repeat_check";
/** The loop's entry for a reply it could not use as a decision (`../../llm/unusable-decision.ts`). */
const DECISION_CHECK = "core.decision_check";
/** The loop's result code for a call refused as a repeat (`../../llm/repeat-guard/feedback.ts`). */
const REPEAT_REFUSED = "llm_evidence_loop.repeat_refused";

const DECIDING = "Deciding the next step";

/** What the loop answered the edit with, or that it could not use the reply as a decision at all. */
type Answered = Answer | { kind: "unusable" };
/** The loop's answer, and the amendments it refused by step and reason, where it named them. */
type Heard = { answer: Answered; refusals?: ReadonlyArray<{ step: number; reason: string }> };

/** The edit as `decide` returned it: its decision's words, its amendments, and the evidence the model decided on, whose draft numbers their steps. */
type Held = { iteration: number; title: string; phase: "building"; text: string | undefined; amendments?: unknown; shown?: Evidence };

const record = (value: unknown): Record<string, unknown> | undefined => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined);
const count = (value: unknown): number => (typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0);

/** The draft's refusal reasons in an amendment entry or row, as plain strings. */
function reasonsOf(refused: unknown): string[] {
  return Array.isArray(refused) ? refused.flatMap((item) => { const reason = record(item)?.reason; return typeof reason === "string" ? [reason] : []; }) : [];
}

/** Each refused amendment's step and reason, where the entry or row names both. */
function refusalsOf(refused: unknown): Array<{ step: number; reason: string }> {
  return Array.isArray(refused) ? refused.flatMap((item) => {
    const entry = record(item);
    return typeof entry?.step === "number" && typeof entry.reason === "string" ? [{ step: entry.step, reason: entry.reason }] : [];
  }) : [];
}

/** What the loop's entry for `iteration` says of the edit, when it refused any of it; undefined when it all landed. */
function answeredIn(evidence: Evidence, iteration: number): Heard | undefined {
  for (const entry of evidence) {
    const value = record(entry.value);
    if (!value) continue;
    if (entry.callId === `${DECISION_CHECK}.${iteration}`) return { answer: { kind: "unusable" } };
    if (entry.callId === `${REPEAT_CHECK}.${iteration}`) {
      const outcome = record(value.then)?.outcome;
      return { answer: { kind: "repeated", outcome: typeof outcome === "string" ? outcome : "" } };
    }
    if (entry.callId !== `${AMENDMENT_CHECK}.${iteration}`) continue;
    const reasons = reasonsOf(value.refused);
    // Edits that put the draft back exactly as it stood: the Flow is as it was.
    if (reasons.length === 0 && typeof value.sameDraftAsIteration === "number") return { answer: { kind: "undone" } };
    const applied = count(value.applied);
    if (applied === 0 || reasons.length > 0) return { answer: { kind: "refused", reasons, applied }, refusals: refusalsOf(value.refused) };
  }
  return undefined;
}

/** What the stalled round's trace says of the decision at `iteration`; undefined when it all landed. */
function answeredInTrace(trace: Stalled["trace"], iteration: number): Heard | undefined {
  const row = [...trace].reverse().find((candidate) => candidate.iteration === iteration);
  if (!row) return undefined;
  if (row.decision === "unusable" && row.resultCode !== REPEAT_REFUSED) return { answer: { kind: "unusable" } };
  if (row.resultCode === REPEAT_REFUSED) return { answer: { kind: "repeated", outcome: row.resultReason ?? "" } };
  if (row.decision !== "amend_draft" || row.resultCode === "llm_evidence_loop.draft_rerun") return undefined;
  const reasons = reasonsOf(row.amendmentsRefused);
  const applied = count(row.amended);
  return applied === 0 || reasons.length > 0 ? { answer: { kind: "refused", reasons, applied }, refusals: refusalsOf(row.amendmentsRefused) } : undefined;
}

/**
 * One round's edit waiting for the loop's answer: `hold` it as `decide`
 * returns, then `decided` (the next decision's evidence), `ran` (a tool call)
 * or `stalled` (the stalled round's trace) says it, once: the decision with
 * the model's reason, then the card with Core's answer and, where it changed
 * the Flow, what it changed -- or, for a reply the loop could not use as a
 * decision, only that deciding didn't work. An edit that landed and only asked
 * for a step to run again has no card (see the header).
 */
export function automationStudioActivityDraftEdit(): {
  hold(edit: Held): void;
  decided(evidence: Evidence): void;
  ran(): void;
  stalled(input: Stalled): void;
} {
  let held: Held | undefined;
  const landed: Heard = { answer: { kind: "landed" } };
  const say = (heard: Heard): void => {
    const edit = held;
    held = undefined;
    if (!edit) return;
    const { answer } = heard;
    if (answer.kind === "unusable") {
      // Nothing was done: said as the decision that didn't work, as one that never came is (`../observer.ts`).
      emitAutomationStudioActivity({ phase: "thinking", label: `${DECIDING} — didn't work`, detail: { kind: "thought", title: DECIDING, status: "failed" } });
      return;
    }
    const changed = answer.kind === "landed" || (answer.kind === "refused" && answer.applied > 0)
      ? automationStudioActivityDraftEditWords({ amendments: edit.amendments, shown: edit.shown ?? [], refused: heard.refusals })
      : { rerun: false };
    emitAutomationStudioActivityThought({ phase: edit.phase, title: edit.title, text: edit.text });
    if (answer.kind === "landed" && changed.rerun && changed.words === undefined) return;
    emitAutomationStudioActivity(automationStudioActivityDraftEditCard(answer, changed.words));
  };
  return {
    hold: (edit) => { say(landed); held = edit; },
    decided: (evidence) => { if (held) say(answeredIn(evidence, held.iteration) ?? landed); },
    ran: () => say(landed),
    stalled: (input) => { if (held) say(answeredInTrace(input.trace, held.iteration) ?? landed); }
  };
}
