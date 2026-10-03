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
// So the edit's card waits for the loop's answer, which arrives on one of the
// seams the observer already wraps, and nothing the loop does is touched:
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
// A round that ends any other way right after an edit (its budget spent) never
// says that edit: no seam reports it, and a card that might claim work Core
// refused is worse than none.

import type { AutomationStudioLlmEvidenceLoopInput } from "../llm/index.ts";
import { emitAutomationStudioActivityThought } from "./thought.ts";
import { automationStudioActivityDraftEditRefused } from "./wording/index.ts";

type Evidence = Parameters<AutomationStudioLlmEvidenceLoopInput["decide"]>[0]["evidence"];
type Stalled = Parameters<NonNullable<AutomationStudioLlmEvidenceLoopInput["unusableDecisions"]>["stalled"]>[0];

/** The refusal entries' tool ids (`../llm/draft-amendment-feedback.ts`, `../llm/repeat-guard/feedback.ts`), read as plain strings so this module does not reach into the loop. */
const AMENDMENT_CHECK = "core.amendment_check";
const REPEAT_CHECK = "core.repeat_check";
/** The loop's result code for a call refused as a repeat (`../llm/repeat-guard/feedback.ts`). */
const REPEAT_REFUSED = "llm_evidence_loop.repeat_refused";

type Held = { iteration: number; title: string; phase: "building"; text: string | undefined };
type Refusal = { reasons: readonly string[] } | { repeated: string };

const record = (value: unknown): Record<string, unknown> | undefined => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined);

/** The draft's refusal reasons in an amendment entry or row, as plain strings. */
function reasonsOf(refused: unknown): string[] {
  return Array.isArray(refused) ? refused.flatMap((item) => { const reason = record(item)?.reason; return typeof reason === "string" ? [reason] : []; }) : [];
}

/** What the loop's refusal entry for `iteration` says, when it refused the whole edit; undefined when the edit landed, even in part. */
function refusedIn(evidence: Evidence, iteration: number): Refusal | undefined {
  for (const entry of evidence) {
    const value = record(entry.value);
    if (!value) continue;
    if (entry.callId === `${REPEAT_CHECK}.${iteration}`) {
      const outcome = record(value.then)?.outcome;
      return { repeated: typeof outcome === "string" ? outcome : "" };
    }
    if (entry.callId === `${AMENDMENT_CHECK}.${iteration}` && value.applied === 0) return { reasons: reasonsOf(value.refused) };
    // Edits that put the draft back exactly as it stood: the Flow is as it was.
    if (entry.callId === `${AMENDMENT_CHECK}.${iteration}` && Array.isArray(value.refused) && value.refused.length === 0 && typeof value.sameDraftAsIteration === "number") return { reasons: [] };
  }
  return undefined;
}

/** What the stalled round's trace says of the decision at `iteration`. */
function refusedInTrace(trace: Stalled["trace"], iteration: number): Refusal | undefined {
  const row = [...trace].reverse().find((candidate) => candidate.iteration === iteration);
  if (!row) return undefined;
  if (row.resultCode === REPEAT_REFUSED) return { repeated: row.resultReason ?? "" };
  if (row.decision === "amend_draft" && !row.amended && row.resultCode !== "llm_evidence_loop.draft_rerun") return { reasons: reasonsOf(row.amendmentsRefused) };
  return undefined;
}

/**
 * One round's edit waiting for the loop's answer: `hold` it as `decide`
 * returns, then `decided` (the next decision's evidence), `ran` (a tool call)
 * or `stalled` (the stalled round's trace) says it, once.
 */
export function automationStudioActivityDraftEdit(): {
  hold(edit: Held): void;
  decided(evidence: Evidence): void;
  ran(): void;
  stalled(input: Stalled): void;
} {
  let held: Held | undefined;
  const say = (refusal: Refusal | undefined): void => {
    const edit = held;
    held = undefined;
    if (!edit) return;
    if (!refusal) {
      emitAutomationStudioActivityThought({ phase: edit.phase, title: edit.title, text: edit.text });
      return;
    }
    const words = automationStudioActivityDraftEditRefused(refusal, edit.text);
    emitAutomationStudioActivityThought({ phase: edit.phase, title: words.title, text: words.text, status: "failed", max: words.text.length });
  };
  return {
    hold: (edit) => { say(undefined); held = edit; },
    decided: (evidence) => { if (held) say(refusedIn(evidence, held.iteration)); },
    ran: () => say(undefined),
    stalled: (input) => { if (held) say(refusedInTrace(input.trace, held.iteration)); }
  };
}
