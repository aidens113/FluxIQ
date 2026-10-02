// A rerun runs from its step's own place in the Flow, never from wherever the
// last call left the target.
//
// **The failure this closes (lane C, t194 runs 11 and 12, earbuds).** A list
// read paginated to page 5, which left the page there. Every rerun of that read
// -- the model correcting its filter -- was then sent as an ordinary call, ran
// on page 5, read one page of 11 items, and answered unfiltered: 0 of 13 rows,
// in the build and in all nine re-author reruns (`run-muq4oaof-464f5bce`,
// `run-muq66ff9-cb3767a1`). The step had recorded where it started; nothing
// used it.
//
// **The rule.** Before a rerun, the target is put back where the step it
// replaces found it: the same reset a replay sends, `{ replay: "reset", from }`
// with that step's own `replay.from` (`./replay.ts`), through the same executor,
// so the same permission gate answers it. A rerun is one step done again, not a
// replay of the Flow from its start, so this belongs to exploration as much as
// to repair.
//
// - A step that recorded no `from` is put back to where its node started in
//   the run its draft was seeded from, when that run recorded it (`startedOn`,
//   `./run-start-pages.ts`). This is a step carried from a Flow
//   (`./draft-from-flow.ts`): the build never ran it, so it has no `from` of
//   its own, and live run `run-muqk713g-d08ad3dc` (C6) reran exactly such a
//   read on results page 5, where the refuted run had left the page -- 1 page,
//   11 items, kept 0 -- in every one of its re-author reruns. The step's own
//   `from` wins when it has one: it is where this build saw the step start.
// - A step with neither runs where it is: nothing says where else. Its result
//   says so (`automationStudioNodeRerunPlaceNoted`), because a rerun that read
//   whatever page the last call left is not evidence about the step, and the
//   model that read C6's eleven unfiltered rows had no way to know.
// - A step whose recorded page is the page the loop last saw runs where it is,
//   without a reset that would throw away what the page holds.
// - A reset that did not put the target back runs nothing: the rerun is
//   answered with that failure (`rerun_place_unreachable`), never with a read
//   of whatever the target shows.
//
// Every rerun that ran says in its result where it ran (`rerunPlace`), so the
// model and anyone reading the run's steps can tell a rerun on its own start
// page from one on the page the last call left.
//
// What a reset puts back is what `from` names -- for the web, an address. State
// a step found that its address does not carry (a filter set by a press on the
// same address) is not restored; the rerun then reads the address fresh, which
// is still the step's own page and never the last one a call reached.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioLlmEvidenceParseToolExecutionResult } from "../evidence-loop-decision.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../evidence-loop.ts";
import { AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES, automationStudioNodeReplayResetCall, automationStudioNodeReplayToolId } from "./replay.ts";

/** The result code of a rerun that ran nothing, because its step's place could not be put back. */
export const AUTOMATION_STUDIO_NODE_RERUN_PLACE_UNREACHABLE_CODE = "llm_evidence_loop.rerun_place_unreachable";

/**
 * Where a rerun runs: as the target stands, after it was put back, or nowhere.
 *
 * `in_place` says why: the target was `already_there`, or no start page was
 * known (`start_page_unknown`) and it ran wherever the last call left it.
 * `put_back` says whose start page it went back to: the `step`'s own, or the
 * one its node started on in the run the draft was seeded from (`seeded_run`).
 */
export type AutomationStudioNodeRerunPlace =
  | { kind: "in_place"; why: "already_there" | "start_page_unknown" }
  | { kind: "put_back"; callId: string; startPage: "step" | "seeded_run" }
  /** `result` is what the rerun is answered with, in place of running it. */
  | { kind: "unreachable"; callId: string; result: AutomationStudioLlmEvidenceToolExecutionResult };

/** Puts the target back where `step` found it, when it is not there already. */
export async function automationStudioNodeRerunFromItsPlace(input: {
  step: AutomationStudioFlowDraftStep;
  /**
   * Where the step's node started in the run its draft was seeded from
   * (`./draft-from-flow.ts`, `startedOnByStepId`). Used only when the step
   * recorded no `replay.from` of its own.
   */
  startedOn?: JsonObject | undefined;
  /** The state the loop last saw the target in, when it saw one. */
  now: string | undefined;
  /** The rerun's own call id; the reset is sent as `<callId>.place`. */
  callId: string;
  executeTool(request: { callId: string; toolId: string; value: JsonObject; signal?: AbortSignal }): Promise<JsonValue | AutomationStudioLlmEvidenceToolExecutionResult>;
  signal?: AbortSignal | undefined;
}): Promise<AutomationStudioNodeRerunPlace> {
  const own = input.step.replay?.from;
  const from = own ?? input.startedOn;
  if (!from) return { kind: "in_place", why: "start_page_unknown" };
  if (input.now !== undefined && input.now === input.step.stateBefore) return { kind: "in_place", why: "already_there" };
  const callId = `${input.callId}.place`;
  let answered: ReturnType<typeof automationStudioLlmEvidenceParseToolExecutionResult>;
  try {
    const ran = await input.executeTool({ callId, toolId: automationStudioNodeReplayToolId(input.step), value: automationStudioNodeReplayResetCall(from), ...(input.signal ? { signal: input.signal } : {}) });
    answered = automationStudioLlmEvidenceParseToolExecutionResult(ran, "mutate");
  } catch (error) {
    if (input.signal?.aborted) throw error;
    answered = undefined;
  }
  if (answered?.resultCode === AUTOMATION_STUDIO_NODE_REPLAY_RESULT_CODES.replayed && answered.effectApplied === true) return { kind: "put_back", callId, startPage: own ? "step" : "seeded_run" };
  return {
    kind: "unreachable",
    callId,
    result: {
      kind: "llm_evidence_tool_execution",
      effectApplied: false,
      resultCode: AUTOMATION_STUDIO_NODE_RERUN_PLACE_UNREACHABLE_CODE,
      evidence: {
        ok: false,
        code: "rerun_place_unreachable",
        detail: "Nothing was run. A rerun runs from the page its step started on, and that page could not be put back, so reading or acting here would not be that step.",
        ...(answered ? { putBack: answered.evidence } : {})
      }
    }
  };
}

/** The key a rerun's result carries its place under. */
const RERUN_PLACE_KEY = "rerunPlace";

/** What a rerun that ran where the page was is told, in words a model acts on. */
const IN_PLACE_DETAIL = "This rerun ran where the page is now, not where its step started: nothing recorded the page the step started on, so the page was not put back. If an earlier call moved the page (another results page, a scroll, a filter), this answer is about that page and not the step's own.";

/**
 * The rerun's result, saying where it ran.
 *
 * Written into the result's evidence object under `rerunPlace`, so the model
 * reads it beside the answer it qualifies and the run's step record keeps it.
 * A result whose evidence is not an object is left as it is rather than
 * reshaped, and so is a place that ran nothing: its own answer already says so.
 */
export function automationStudioNodeRerunPlaceNoted(
  place: AutomationStudioNodeRerunPlace | undefined,
  ran: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult
): JsonValue | AutomationStudioLlmEvidenceToolExecutionResult {
  const note = placeNote(place);
  if (!note || !isObject(ran)) return ran;
  if (ran.kind !== "llm_evidence_tool_execution") return { ...ran, [RERUN_PLACE_KEY]: note };
  const execution = ran as AutomationStudioLlmEvidenceToolExecutionResult;
  return isObject(execution.evidence) ? { ...execution, evidence: { ...execution.evidence, [RERUN_PLACE_KEY]: note } } : ran;
}

function placeNote(place: AutomationStudioNodeRerunPlace | undefined): JsonObject | undefined {
  if (!place) return undefined;
  if (place.kind === "put_back") return { place: "put_back", startPage: place.startPage };
  if (place.kind === "unreachable") return undefined;
  return place.why === "already_there"
    ? { place: "in_place", reason: "already_on_start_page" }
    : { place: "in_place", reason: "start_page_unknown", detail: IN_PLACE_DETAIL };
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
